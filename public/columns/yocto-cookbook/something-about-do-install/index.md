大家好，我是吴震宇。

yocto 构建过程，主要由 do_fetch 获取源代码，do_patch 给源代码打补丁，do_configure 配置，do_compile 编译源代码，do_install 安装，do_package 打包这些任务组成。

其中，do_install 位于 do_compile 之后，也是发生在 `${B}` 中的任务，将 do_compile 任务中调用编译器编译的结果安装到 `${D}` 目录中，通常为 `${WORKDIR}/image` 目录。

do_install 任务中安装的文件，是提供给当前 recipe 对应的 target 使用的，而这些文件是如何 populate 给其他的 target 使用呢？

## do_install 任务浅析
do_install 的初始定义位于 `meta/classes/base.bbclass`
```
addtask install after do_compile
do_install[dirs] = "${B}"
# Remove and re-create ${D} so that is it guaranteed to be empty
do_install[cleandirs] = "${D}"

base_do_install() {
	:
}
```
通过 `EXPORT_FUNCTIONS do_install` 的方式，将 do_install 函数导出，暴露给其他 recipe 使用。`base_do_install` 的实现是一个空实现，所以在各自的 recipe 中需要定义自己 `do_install` 的实现。如果是 cmake 构建，在 recipe 中继承了 `cmake.bbclass`，可以使用 `cmake.bbclass` 中默认实现。
```
cmake_do_install() {
	DESTDIR='${D}' cmake_runcmake_build --target ${OECMAKE_TARGET_INSTALL}
}
```
install 时指定了 DESTDIR 为 `${D}`，make 在执行时，会将文件安装到 `${D}` 目录中。

yocto 在构建时，分成两部分进行，一部分是构建用于交叉编译的工具，也就是 class-native 的目标，一部分是交叉编译，也就是 class-target 的目标。

比如 `zstd_1.5.2.bb` 中的 do_install 的实现
```
do_install () {
    oe_runmake install 'DESTDIR=${D}'
    oe_runmake install 'DESTDIR=${D}' PREFIX=${prefix} -C contrib/pzstd
}
```
target 交叉编译时，prefix 的值为 `/usr`，而在 native 编译时，prefix 的值为 `${STAGING_DIR_NATIVE}${prefix_native}`。我们可以通过 `bitbake-dumpsig` 来查看 do_install 对应的 stamp 文件，在 `build/tmp/stamps/TARGET_ARCH-TARGET_OS/zstd-native/1.5.2-ro.do_install.sigdata.XXXXX` 文件中
```
bitbake-dumpsig build/tmp/stamps/TARGET_ARCH-TARGET_OS/zstd-native/1.5.2-ro.do_install.sigdata.XXXXX
```
可以看到 native 下 zstd 执行 do_install 任务的依赖，以及变量的值
```
...
Variable STAGING_DIR_NATIVE value is ${RECIPE_SYSROOT_NATIVE}
...
Variable prefix value is ${STAGING_DIR_NATIVE}${prefix_native}
Variable prefix_native value is /usr
...
```
native 下 do_install 仍然是安装到 `${WORKDIR}/image` 目录中，但是 prefix 是一个嵌套很深的路径，与 target 不同。

而造成这种差异，是 native 编译，cross.bbclass 的配置造成的。
```
# Overrides for paths
CROSS_TARGET_SYS_DIR = "${TARGET_SYS}"
prefix = "${STAGING_DIR_NATIVE}${prefix_native}"
base_prefix = "${STAGING_DIR_NATIVE}"
exec_prefix = "${STAGING_DIR_NATIVE}${prefix_native}"
```
> The cross class provides support for the recipes that build the cross-compilation tools.

这句话有点绕。cross.bbclass 是 yocto 提供的专门为构建交叉编译工具提供支持的。交叉编译所用的工具，都是 yocto 通过 recipe 的方式构建出来的 host 工具(部分工具是通过 HOSTTOOLS 的方式直接指定的本地工具)。这部分的构建就属于 class-native 构建，所以说 cross.bbclass 是为 native 构建设置的。

do_install 任务执行后，需要通过 `do_populate_sysroot` 任务才能将安装的文件提供给其他模块使用。

## 其他模块在编译时如何使用 image 中安装的文件
do_populate_sysroot 是定义在 `staging.bbclass` 中的 bitbake-style 风格的 python 函数，在 do_install 任务后执行。
```
addtask populate_sysroot after do_install
```
该任务首先会调用 `sysroot_stage_all` 函数，然后会对二进制文件做一些 strip 的操作。
```
sysroot_stage_dirs() {
	from="$1"
	to="$2"

	for dir in ${SYSROOT_DIRS}; do
		sysroot_stage_dir "$from$dir" "$to$dir"
	done

	# Remove directories we do not care about
	for dir in ${SYSROOT_DIRS_IGNORE}; do
		rm -rf "$to$dir"
	done
}

sysroot_stage_all() {
	sysroot_stage_dirs ${D} ${SYSROOT_DESTDIR}
}

SYSROOT_DESTDIR = "${WORKDIR}/sysroot-destdir"
```
`sysroot_stage_all` 函数，将文件从 `${D}` 中 copy 到 `${WORKDIR}/sysroot-destdir` 中。可以看下上面的 `sysroot_stage_dirs` 函数，该函数会遍历 `${SYSROOT_DIRS}` 中的所有目录，然后将文件逐个目录的 copy 到 `${SYSROOT_DESTDIR}` 中。

当其他 recipe 中通过 DEPENDS 依赖当前 recipe 时，该 target 在构建时，会通过 `do_prepare_recipe_sysroot` 任务将依赖的文件从 `${SYSROOT_DESTDIR}` 中 copy 到 `${RECIPE_SYSROOT}` 或者 `${RECIPE_SYSROOT_NATIVE}` 中，这样就使用到了 do_install 任务安装到 image 目录中的文件了。

如果在 do_install 中额外创建了新的目录，而该目录不在 `SYSROOT_DIRS` 变量中，那么该目录中的文件将不会通过 `do_populate_sysroot` 任务 copy 到 `${SYSROOT_DESTDIR}` 中，这样其他模块就不能使用了。

出现这个问题时，(假设 B 依赖 A)
1. 首先需要检查一下 B 的 recipe 中 DEPENDS 是否依赖 A
2. 然后再检查 B 的构建目录中 `${RECIPE_SYSROOT}` 中是否存在 A 中这些新目录以及对应的文件。
3. 如果不存在，那么回到原 A 的构建目录中，检查 image 目录中安装的文件以及 sysroot-destdir 中对应的文件是否存在；
4. 如果两个目录中的文件不同，那么需要在 A 的 recipe 中 为 `SYSROOT_DIRS` 变量加上新创建的目录，使得 `do_populate_sysroot` 任务能够将新创建的目录文件 copy 到 `${SYSROOT_DESTDIR}`。

## 内容小结
do_install 任务将 do_compile 任务编译出来的结果安装到当前 target 构建目录的 image 目录中，然后通过 `do_populate_sysroot` 的方式将文件 copy 到 `sysroot-destdir` 目录中，并对二进制文件进行 strip，以提供给其他有依赖关系的模块，在构建时 copy 到其 sysroot 中进行使用。

## reference
1. https://docs.yoctoproject.org/ref-manual/classes.html#ref-classes-cross
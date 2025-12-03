## 1. 为什么 do_install 看起来会执行很多次
比如使用 clang 来编译 make-4.2.1，在 build 目录中，编译 make 时，会在 make 的编译目录中看到 clang 工具链

![image.png](/images/columns/yocto-problems/4.png)

这两个文件，其实是一个脚本，比如 aarch64-linux-gnu-clang

```shell
#!/bin/sh
exec /workspace/alios-clang/bin/clang "$@"
```

这个目录以及链接脚本创建，是因为在 bbclass 或者 bb 文件中继承了 cross.bbclass，而在 cross.bbclass 中，定义了 `do_addto_recipe_sysroot`函数，就是该函数，完成的上述 installation

![Alt text](/images/columns/yocto-problems/5.png)

也就说，每一个模块，编译结束后都会通过 `do_install` 将 FILES 指定的文件安装到 `${WORKDIR}/image` 中，同时通过 `do_populate_sysroot` 将文件 copy 到 `sysroot-destdir` 中。当其他模块依赖该模块时，其他模块在构建过程中，通过 `do_prepare_sysroot` 任务，就会将依赖的模块，`sysroot-destdir` 中的文件 copy 到自己的 `recipe-sysroots` 或者 `recipe-sysroots-native` 中，这就好像又执行了一次被依赖模块的 `do_install` 任务。

## 2. No valid terminal found, unable to open devshell
当使用 bitbake 的 devshell 命令时，可能发生上述错误。这是因为当前环境中缺少 tmux 导致的，安装即可
```
sudo apt-get install tmux
```

## 3. Files/Directories were installed but not shiped in any packages
该错误发生时，bitbake 会指出有哪些文件没有被打包。

`do_install` 任务执行结束后，bitbake 会将编译好的文件，以及头文件等，按照 FILES 变量指定的方式，安装到 `${WORKDIR}/image` 文件夹中。比如安装的时候，使用
```
make install DESTDIR=${DESTDIR}
```
但是通过该方式安装到 `${WORKDIR}/image` 中的文件，有一些 recipes 中没有通过 FILES_${PN} 的方式指定，就是出错是 bitbake 指出的那些文件或者目录，bitbake 就会抛出上述的错误。

只需要在 recipe 的 FILES 变量中将这些文件加上即可。这些通过 FILES 指定的文件，安装到 image 文件夹中后，后面会用于 do_package 的方式进行打包。

```shell
FILES_${PN} 打包一个 rpm
FILES_${PN}-dev 打包一个 devel 的 rpm
# 通过这种方式可以区分不同的 rpm 中的内容
```

## 4. ERROR：The file /lib64/libnss_resolve.so.2 is installed by both
这个错误发生的场景，是这样的：
比如软件 A 依赖了软件 B 和 C，bitbake 在构建 A 时，通过 `do_prepare_sysroot` 会将 B 以及 C 的 sysroot-destdir 中的文件 copy 到 A 的 recipe-sysroots 或者 recipe-sysroots-native 中。此时发现，B 和 C 中都出现了 `libxx.so` 这个库文件，bitbake 就会抛出 `ERROR: The file libxx.so is installed by both B and C`。

弄明白了这个原因，再来分析一下上述的问题。

在 `build/tmp/sstate-control` 中的 manifest 文件中，记录了各个模块通过 `do_prepare_sysroot` 传播的文件。

`manifest-${ARCH}-${taskname}.populate_sysroot` 文件，是通过 `do_populate_sysroot` 产生的，且在 `extend_recipe_sysroot` 函数中进行校验，对文件中的内容进行校验。当模块依赖的任务的 manifest 文件中，同时都包含某一个文件时，就会发生上述错误。

在 cross.bbclass 中可以看到， `extend_recipe_sysroot` 在 `do_populate_sysroot` 函数之后执行。这两个函数都定义在 staging.bbclass 文件中。

比如上述错误，是在使用 `meta-external-toolchain` 这个 layer 是出现的。

分析发现，在 `glibc-external` 的 image 中，出现了 `libnss_resolve.so.2` 这个库，查看日志发现

![Alt text](/images/columns/yocto-problems/6.png)

在 `do_install` 中

![Alt text](/images/columns/yocto-problems/7.png)

会有一个 `copy_from_sysroots` 的过程，这个过程，首先将 `FILES_MIRROR` 中的路径，与 FILES 变量中的文件名进行拼接，在 sysroot 中进行搜索，将搜索到的文件 copy 到 `glibc-external` 的 image 目录中。

这样，在其他模块使用到 `glibc-external` 时，会通过 `prepare_populate_sysroot` 和 `do_populate_sysroot` 将这些文件 copy 到该模块的 `recipes-sysroot-native` 中，交叉编译的在 `recipes-sysroot` 中。

而 rootfs 中是已经准备好用于编译的根文件系统，存在很多的 prebuilt libraries。poky 中，在 `meta/recipes-core/glibc/glibc-package.inc` 中有如下定义
```
FILES:glibc-extra-nss = "${base_libdir}/libnss_*-*.so ${base_libdir}/libnss_*.so.*"
```
这使得 `glibc-extra-nss` 在同配时，不仅匹配上了 glibc 本身的 nss 库，还匹配上了 openssl 中的 `libnss_resolve.so.2`，`glibc-external` 在 `do_install` 时将 openssl 的库也从 rootfs 中 copy 到了 `glibc-external` 的 image 中。

这样导致当在编译其他模块时，依赖 openssl，也依赖 `glibc-external`，bitbake 就会发现两个 package 都存在 `libnss_resolve.so.2` 这个库，就会抛出上述问题。

解决这个问题的方法就是去掉重复的文件。按照道理不应该有同名的文件，如果头文件中真的出现了同名文件也应该要换一个路径，加上一个子目录。否则在实际安装时，同名的文件安装到同一个目录中势必会出现文件被覆盖的现象。

## 5. 如何让配置全局生效
在 recipe 中设置的配置，生效范围是在该 recipe 构建的上下文中。如果需要让一个配置全局生效，可在 `build/conf/local.conf` 中进行配置。

## 6. manifest not found in (variant '')?
错误描述
```
ERROR: core-image-minimal-1.0-ro do_rootfs: Manifest /workspace/build/tmp/sstate-control/manifest-x86_64_x86_64-nativesdk-glibc-locale.package_write_rpm not found in cortexta55 armv8-2a-crypto armv8-2a armv8 aarch64 allarch x86_64_x86_64-nativesdk (variant '')?
```
分析一下上述错误，这是在交叉编译任务的时候出现的，但是错误信息提示到了 x86_64 nativesdk。

在具体看下 manifest 文件的文件名信息，这是 `glibc-locale` 这个 recipe 触发的错误，触发错误的 task 是 `package_write_rpm` 这个任务。

可能得原因是，`package_write_rpm` 这个任务执行时，也需要有对应的 manifest 文件，从而知道打包的 rpm 文件中的文件内容和文件位置。但是如果没有对应的 manifest 文件，就会抛出上述错误。而文件不存在，很大概率是 `package_write_rpm` 这个任务被关掉了，没能正常执行。比如在 recipe 中使用了
```
package_write_rpm[noexec] = "1"
```
在 recipe 中重新 enable 该任务即可。

## 7. owned by uid 1006, gid 1006, which doesn't match any user/group on target
这是 `do_install` 任务执行时出现的权限问题。`do_install` 执行是在 bibtake 的 fakeroot 权限下执行的，如果权限不对，就会导致上述问题。（社区中也有关于该问题的讨论）

> [https://lore.kernel.org/yocto/0589ee54d2979bb38725f5e987bf09a655c96133.camel@linuxfoundation.org/T/](https://lore.kernel.org/yocto/0589ee54d2979bb38725f5e987bf09a655c96133.camel@linuxfoundation.org/T/)

![Alt text](/images/columns/yocto-problems/20.png)

解决的方式就是在 `do_install` 中添加一个 chown 命令修改权限
```
chown -R root:root ${D}${bindir}
```

## 8. do_fetch 任务在解压缩 tar.xz 的源代码文件时出现 xz no exec
问题描述: 在编写的 recipe 中，SRC_URI 中指定了源代码的 git 仓库，而 git 仓库中实际保存了源代码的 `src.tar.xz` 压缩文件。bitbake 通过 `do_fetch` 拉取 git 仓库后，会使用 xz 命令来解压缩 `src.tar.xz` 文件。此时就会出现上述问题。

原因是 bitbake 不会直接调用 host 机器上的 xz 命令，而是会通过 xz 的 recipe 文件，使用源代码构建一个 `xz-native` 的目标，编译一个本地的 xz 工具来执行解压缩任务。此时，recipe 中必须要指定对 `xz-native` 的依赖，否则 bitbake 执行解压缩任务时，因为没有指定 `xz-native` 的依赖，`do_prepare_sysroot` 任务不会将 `xz-native` 的文件 copy 到 `recipe-sysroot-native` 中，导致解压缩任务失败，导致调用 xz 命令时，找不到 xz 命令，抛出错误。

解决方式：在 recipe 中添加对 `xz-native` 的依赖即可。
```
do_patch[depends] = "xz-native:do_populate_sysroot"
```
这种添加依赖的方式，只是针对 `do_patch` 这个任务，说明 `do_patch` 这个任务依赖了 `xz-native` 的 `do_populate_sysroot` 任务。

## 9. do_patch:git binary diffs are not supported
该错误是 bitbake 在执行 `do_patch` 任务时，将 `.patch` 文件应用到源代码中时，出现了错误。

如果 `.patch` 文件中都是 diff，说明是通过 diff 命令或者 quilt 命令导出的 patch 文件，这个时候，`do_patch` 任务应该调用 quilt 来打补丁。如果是 `git diff`，bitbake 会在源代码路径 `${S}` 中应用
```
git init
```
将源代码目录初始化成 git 仓库，然后使用 
```
git apply XXX.patch
```
的方式来打补丁。当前错误表明应该使用 git 的方式来打补丁，可以使用 PATCHTOOL 变量指定
```
PATCHTOOL = "git"
```

## 10. do_configure error: Can't exec "autopoint": No such file or directory
bitbake 在执行 `do_configure` 任务时抛出了上述错误。原因是 bitbake 在执行 `do_configure` 任务时，会调用 `autopoint` 命令来执行本地化的任务。但是在执行 `do_configure` 任务时，bitbake 并没有将 `autopoint` 这个命令 copy 到 `recipe-sysroot-native` 中，导致在执行 `do_configure` 任务时，找不到 `autopoint` 命令。

configure 需要 autopoint 命令，而 autopoint 属于 gettext。

解决方式：在 recipe 中添加对 `gettext-native` 的依赖即可。
```
DEPENDS += "gettext-native"
```

## 11. bitbake 中的网络设置
bitbake 对所有的 task 都进行了网络限制

![22](/images/columns/yocto-problems/22.png)

只有 flag 设置了 network 的 task，才能连接网络，否则，该 task 就禁止访问网络。
```
mytask[network] = "1"
```
将 mytask 的 network 设置为 1 后，mytask 任务中就可以正常访问网络了。

![Alt text](/images/columns/yocto-problems/23.png)

## 12. xsltproc I/O error:Attempt to load network entity
该错误是因为缺少 `docbook-xsl-stylesheets-native` 的依赖，加上该依赖即可
```
DEPENDS += "docbook-xsl-stylesheets-native"
```

## 13. do_configure error: --should-not-have-used-/usr/bin/XXX
这个是因为该模块依赖的另一个模块中，使用了
```
binconfig-disabled.bbclass
```
同时设置了 BINCONFIG 变量，`binconfig-disabled.bbclass` 会将该变量设置的二进制文件，封装成 `disable should not use` 的状态。

![Alt text](/images/columns/yocto-problems/21.png)

这个一般是在高版本的源代码中，configure 使用 `pkg-config` 的方式来 check 依赖的库存不存在，而不是通过依赖库提供的 `XXX-conf` 脚本的方式。但是在低版本的源代码中，configure 脚本仍然采用的 `XXX-conf` 的方式，所以这里不能使用 `binconfig-disabled.bbclass`。可以通过如下方式解决
````
BINCONFIG = "XXX1-config XXX2-config"
SYSROOT_PREPROCESS_FUNCS += "binconfig_disabled_sysroot_preprocess"
binconfig_disabled_sysroot_preprocess () {
	for x in ${BINCONFIG}; do
		configname=`basename $x`
		install -d ${SYSROOT_DESTDIR}${bindir_crossscripts}
		install ${D}${bindir}/$x ${SYSROOT_DESTDIR}${bindir_crossscripts}
	done
}
````
不对 `XXX-config` 进行封装，而是安装到 `usr/bin` 中，同时对交叉编译，需要安装一份到 `usr/bin/crossscripts` 中。native 编译直接使用 `recipe-sysroots-native/usr/bin` 中的，而交叉编译使用 `recipe-sysroots/usr/bin/crossscripts` 中的。
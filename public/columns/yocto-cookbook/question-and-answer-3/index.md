# 问题汇总

## 1. CONF file 'conf/xxx/xxx.conf' not found

文件没有找到，即使在 bblayers.conf 中的 BBLAYERS 中已经将 layer 加入了。
这是因为 conf 文件所在的 layer 中，conf/layer.conf 文件中的 BBPATH 变量没有设置正确，通常设置如下

```shell
BBPATH .= ":${LAYERDIR}"
```

该变量只在当前 conf 文件中生效，保存的是当前 layer 的路径。主要用于在 variable expansion 阶段，寻找对应 layer 的文件。

## 2. No files found in external toolchain sysroot for
![image.png](/images/columns/yocto-problems/1.png)

发现是因为 search_pattern 是 `/usr/lib64/gcc/aarch64-poky-linux/12/crtbeginS.o`
而工具链的 sysroot 中这个路径不存在。应该是

```shell
${SYSROOT}/usr/lib64/gcc/aarch64-linux-gnu/12/crtbeginS.o
```

## 3. python yield 关键字的坑
![image.png](/images/columns/yocto-problems/2.png)


调试时，增加了一个日志打印的语句，将 paths 中的内容打印出来。这里就出现了问题，因为 paths 内容打印结束后，就变成了 empty

![image.png](/images/columns/yocto-problems/3.png)

原因是 search_sysroots 函数，返回的不是一个所有的 path，而是一个 generator 产生的 iterator。
在 bb.note 中通过 iterator 的方式打印后，就相当于 consume 了这个 iterator，iterator 的指针指向了末尾，再次访问就变成了空的了。

> The yield keyword in Python is used in the context of generators and generator functions. It allows you to create an iterator that can produce a sequence of values, one at a time, rather than returning them all at once.  
When a generator function encounters a yield statement, it temporarily suspends its execution and returns the yielded value to the caller. The generator function's state is saved, allowing it to resume from where it left off when the next value is requested.  
The for loop consumes the values produced by the generator function. With each iteration, the next value yielded by the generator is printed, until the sequence is exhausted.

## 4. do_packagedata_qa error

通过

```shell
INSANE_SKIP_${PN} += "build-deps file-rdeps"
```

的方式抑制该错误

## 5. 限制 bitbake 编译的进程数

```shell
export PARALLEL_MAKE="-j 4"
export BB_NUMBER_THREADS=4
```

## 6. 为什么 do_install 会执行很多次

比如使用 clang 来编译 make-4.2.1，在 build 目录中，编译 make 时，会在 make 的编译目录中看到 clang 工具链

![image.png](/images/columns/yocto-problems/4.png)

这两个文件，其实是一个脚本，比如 aarch64-linux-gnu-clang

```shell
#!/bin/sh
exec /workspace/alios-clang/bin/clang "$@"
```

这个目录以及链接脚本创建，是因为在 bbclass 或者 bb 文件中继承了 cross.bbclass，而在 cross.bbclass 中，定义了 `do_addto_recipe_sysroot`函数，就是该函数，完成的上述 installation

![Alt text](/images/columns/yocto-problems/5.png)

也就说，编译的每一个module，如果依赖了 clang，而 clang 又继承了 cross，那么在 recipe-sysroot-native 中就会安装相关依赖，此处使用 clang 进行编译的脚本就会安装到这个 sysroot 中，**同时会将该路径加入到 PATH 环境变量中(这里设置 PATH 环境变量，而且这个环境变量是按照每一个 module 的方式来设置，不同 module PATH 不同)**

## 7. Files/Directories were installed but not shiped in any packages

这是当 do_compile 和 do_install 后，do_install 将文件安装到了 image 文件夹中，但是 recipes 中没有通过 FILES_${PN} 的方式指定这些安装的文件，导致错误。这些通过 FILES 指定的文件，安装到 image 文件夹中后，后面会用于 do_package 的方式进行打包。

```shell
FILES_${PN} 打包一个 rpm
FILES_${PN}-dev 打包一个 devel 的 rpm
# 通过这种方式可以区分不同的 rpm 中的内容
```

## 8. ERROR：The file /lib64/libnss_resolve.so.2 is installed by both

manifest-${ARCH}-${taskname}.populate_sysroot 文件，是通过 do_populate_sysroot 产生的，且在 extend_recipe_sysroot 函数中进行校验，对文件中的内容进行校验。当模块依赖的任务的 manifest 文件中，同时都包含某一个文件时，就会发生上述错误。
cross.bbclass 中可以看到， extend_recipe_sysroot 在 do_populate_sysroot 函数之后执行。这两个函数都定义在 staging.bbclass 文件中。
**分析：**
分析发现，在 glibc-external 的 image 中，出现了 libnss_resolve.so.2 这个库，查看日志发现

![Alt text](/images/columns/yocto-problems/6.png)

在 do_install 中

![Alt text](/images/columns/yocto-problems/7.png)

会有一个 copy_from_sysroots 的过程，这个过程，首先将 FILES_MIRROR 中的路径，与 FILES 变量中的文件名进行拼接，在 sysroot 中进行搜索，将搜索到的文件 copy 到 glibc-external 的 image 目录中。这样，在其他模块使用到 glibc-external 时，会通过 prepare_populate_sysroot 和 do_populate_sysroot 将这些文件 copy 到该模块的 recipes-sysroot-native 中，交叉编译的在 recipes-sysroot 中。而 sysroot 是 alios rootfs，里面有很多预先编译好的 binaries，这样就与其他源码编译的模块发生了冲突。
这个问题之所以能够在我们这种情况下出现，是因为 rootfs 中有 openssl 的开发库和头文件，而同时，在编译过程中还对 openssl 进行了源码编译。这种情况是我们之前讨论过的，需要将源码构建 openssl 去掉的。而造成这个问题的原因，是 glibc 库在 populate_sysroot 之前，准备 sysroot 执行 do_install 时，会执行一次 copy_from_sysroots 的动作。这里面 poky 定义了很多的库，比如 libc 中有一个库是 libcrypt.so，poky 通配这些库时，写的通配符是 libcrypt*.so.*，这也是一个异常点。

## 9. 配置如何全局生效

在 local.conf 中进行设置，不要加任何特定的目标后缀即可全局生效。
比如在 glibc-external.bb 中设置的 ASSUME_PROVIDED 只会在编译 glibc-external 模块时生效，如果需要全局生效，需要写入到 local.conf 中

![Alt text](/images/columns/yocto-problems/8.png)

## 10. do_packagedata
TODO：这个 sstate 中文件不存在的问题还没找到，clean 重新编译后就没有这个问题

## 11. manifest not found in (variant '')?
![Alt text](/images/columns/yocto-problems/9.png)
比如图中的错误
这是在编译 c3b 交叉编译时的错误，看错误信息，居然出现了 x86_64，manifest 说的是 nativesdk-glibc-locale，检查 glibc-locale，发现，do_package 相关的 task 都被关掉了，打开即可(打开的任务如果出现错误，仍然需要解决这错误)

## 12. gstreamer1.0 编译 python 3.5 寻找 python3.6 target 库的问题
![Alt text](/images/columns/yocto-problems/10.png)

这个错误的命令，是在 meson 的 build/lib/mesonbuild/modules/python.py 中定义的

![Alt text](/images/columns/yocto-problems/11.png)

## 13. python3 bindings 编译问题

当前采用 rootfs 中预编译的库，python3.6 在 rootfs 中，而 sumo 编译时，native 是 python3.5，采取的措施是编译 python native 3.5，对于需要使用 python3.5 native 的模块正常编译。比如使用 meson 编译是，就需要使用 python3.5 native 执行。但是在 meson find_installation 这个api 时，因为需要寻找 python3.5 target 的相关文件会出错，这里将该 api 改成

```shell
python3 = find_program('python3', required: false)
```

另外还存在 python3-setuptools, python3-pycario, python3-pygobject 这些 bindings 库，既然 python3.6 是 prebuilt 的 target 版本，这些 bindings 库也应该使用 rootfs 提供的基于 3.6 的 bindings，所以这些都不需要编译。

## 14. 在 aarch64 中，将库安装到 /usr/lib 的问题

在 do_install 时，将文件安装，poky 会将 FILES 变量指定的文件安装到 image 中，比如 头文件安装到 ${includedir} 中，库安装到 ${libdir} 中，在 64 位中 libdir 为 /usr/lib64，32 位就是 /usr/lib。如果在 BASELIB 设置为 lib64 时，也就是 64 位环境中，强制将库安装到 /usr/lib 中，那么当编译完成，需要将库 populate 到其他依赖该模块的编译环境中时，可以在 do_populate_sysroot 函数中发现
在 staging.bbclass 中定义了 do_populate_sysroot 函数

![Alt text](/images/columns/yocto-problems/12.png)

调用 sysroot_stage_all

![Alt text](/images/columns/yocto-problems/13.png)

sysroot_stage_all 中，调用 sysroot_stage_dirs 将文件从 from copy 到 to 中。而copy 的目录之一，就是 ${SYSROOT_DIRS} 变量中指定的。

![Alt text](/images/columns/yocto-problems/14.png)

可以扩充该变量，但是默认就是上述几个值，如果 64 位环境是 /usr/lib64 的话，那么 /usr/lib 中的库就不会被传播到依赖该模块的库中，在编译时就会出现库找不到的问题。

## 15. gstreamer bad 编译 glib2 版本问题

编译 gstreamer bad 插件的时候，需要通过 glib2 的 gdbus-codegen 来生成
![Alt text](/images/columns/yocto-problems/15.png)

这两个文件，但是这个命令现在是无法运行的。我看了下，就是多了两个无法识别的参数，--header, --body，我看了下 meson 代码，

![Alt text](/images/columns/yocto-problems/16.png)

问题出在这里，检测出的 glib 的 version 比较高。rootfs 的版本是

![Alt text](/images/columns/yocto-problems/17.png)

，但是 glib2-native 是通过源代码编译的，这里 native 的版本是

![Alt text](/images/columns/yocto-problems/18.png)

刚好小于 2.56.2，导致 target 版本太高，生成的命令，而 glib2 native 版本太低执行不了

### glib-2.0 升级到 2.68.4

在 meta-oa-semidrive-adaptive 中添加 

![Alt text](/images/columns/yocto-problems/19.png)

高版本不再使用 autotool 编译，而是使用的 meson，所以原来低版本的编译方式无法复用了。
在 poky 中 BBFILE 的优先级为 5，在我们 layer 中，将优先级设置的高一些，就能优先使用该layer 中同名的配方进行编译了。

```shell
BBFILE_PRIORITY_alios-apps = "7"
```

## 16. owned by uid 1006, gid 1006, which doesn't match any user/group on target

> [https://lore.kernel.org/yocto/0589ee54d2979bb38725f5e987bf09a655c96133.camel@linuxfoundation.org/T/](https://lore.kernel.org/yocto/0589ee54d2979bb38725f5e987bf09a655c96133.camel@linuxfoundation.org/T/)

![Alt text](/images/columns/yocto-problems/20.png)

```cmake
chown -R root:root ${D}${bindir}
```

## 17. mailcap 在解压缩 tar.xz 时出现 xz no exec

这是因为在 tar 解压缩时，如果是 tar.xz，bitbake 首先需要编译安装 xz-native 到 mailcap 的 recipe-sysroot-native 中才能正常解压缩。
如果是在 do_fetch 阶段，需要在 do_fetch 中添加一个 depends

````
do_patch[depends] = "xz-native:do_populate_sysroot"
````

## 18. set IMAGE_LINGUAS = ""

如果 IMAGE_LINGUAS 没有设置，默认在 do_rootfs 时会添加

````
locale-base-en-us locale-base-en-gb
````

## 19. do_patch:git binary diffs are not supported

````
PATCHTOOL = "git"
````

可以查看 patch 文件，如果都是 git diff，那应该是通过 git apply 的方式打 patch。源代码中，poky 会使用 git init 来初始化该源码仓库

## 20. do_configure error: Can't exec "autopoint": No such file or directory

configure 需要依赖 autopoint，autopoint 属于 gettext，在配方中加上 gettext-native

```cmake
DEPENDS += "gettext-native"
```

## 21. do_configure error: --should-not-have-used-/usr/bin

这个是因为该模块依赖的另一个模块中，使用了

```cmake
binconfig-disabled.bbclass
```

同时设置了 BINCONFIG 变量，binconfig-disabled 会将该变量设置的 二进制文件，封装成 disable，should not use 的状态。

![Alt text](/images/columns/yocto-problems/21.png)

这个一般是在高版本的源代码中，configure 使用 pkg-config 的方式来check依赖的库存不存在，而不是通过依赖库提供的 XXX-conf 脚本的方式。但是在低版本的源代码中，configure 脚本仍然采用的 XXX-conf 的方式，所以这里不能使用 binconfig-disabled.bbclass。可以通过如下方式解决

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

不对 XXX-config 进行封装，而是安装到 usr/bin 中，同时对交叉编译，需要安装一份到 usr/bin/crossscripts 中。native 编译直接使用 recipe-sysroots-native/usr/bin 中的，而交叉编译使用 recipe-sysroots/usr/bin/crossscripts 中的

## 22. bitbake 中的网络设置

bitbake 对所有的 task 都进行了网络限制

![22](/images/columns/yocto-problems/22.png)
只有 flag 设置了 network 的task，才能连接网络，否则，该 task 会被断网。比如

```cmake
mytask[network] = "1"
```

就可以在 mytask 的任务中进行一些需要网络的任务操作。

![Alt text](/images/columns/yocto-problems/23.png)

## 23. xsltproc I/O error:Attempt to load network entity, http://docbook.sourceforge.net/release/xsl/current/manpages/profile-docbook.xsl

> [https://bugzilla.redhat.com/show_bug.cgi?id=428168](https://bugzilla.redhat.com/show_bug.cgi?id=428168)

添加 docbook-xsl-stylesheets-native 依赖，在 DEPENDS 中添加

## 24. do_populate_sysroot native 与 cross 的区别

do_populate_sysroot 是将 image 中的文件copy 到 sysroot-destdir 中，这样，在其他模块依赖的时候，使用 do_prepare_sysroot 时，就是从 sysroot-destdir 中将文件copy过去

- 如果是 cross 就copy到 recipes-sysroot 中
- 如果是 native 就 copy 到 recipes-sysroot-native 中

在 cross 编译中，image 中通过 do_install 的文件，目录结构就是标准的 sysroot 的结构

```shell
- etc
- var
- lib64
- usr
	- lib64
  - include
  - share
```

而在 native 中，image 中 do_install 的是一个完整的路径，workspace/....
**如果不是，就不会 copy 到 sysroot-destdir 中**
在编写 libselinux 的配方时，libselinux 的安装路径都是通过 Makfile 指定的，而 native 安装和 cross 安装的路径不同，就需要分别指定两种不同的安装路径。

## 25. qemu 或者 qemu-system 编译问题

主要是因为 qemu 编译时多进程编译被 kill 导致的，手动多次运行，或者使用单进程模式编译

## 26. glibc-external 中为什么没有 locale

在 glibc-package.inc 中，通过 stash_locale_cleanup，

![Alt text](/images/columns/yocto-problems/24.png)

将 package 中的 locale 全部删除了，这样在组中 write_rpm 的时候，就没有这些文件了。
而 locale 中的文件，在 glibc-locale.bb 中会统一进程处理。这里如果将 stash_locale_cleanup 注释掉，就会与 glibc-locale 冲突。

## 27. DISTRO_FEATURES 的配置
在 poky-tiny.conf 中，有如下配置

![Alt text](/images/columns/yocto-problems/25.png)
在 poky.conf 中，有如下配置

![Alt text](/images/columns/yocto-problems/26.png)
DISTRO_FEATURES_DEFAULT 在 default-distrovars.inc 中设置

![Alt text](/images/columns/yocto-problems/27.png)
默认 DISTRO_FEATURES 为

```xml
DISTRO_FEATURES = acl alsa argp bluetooth debuginfod ext2 ipv4 ipv6 largefile pcmcia usbgadget usbhost wifi xattr nfs zeroconf pci 3g nfc x11 vfat seccomp largefile opengl ptest multiarch wayland vulkan systemd systemd pulseaudio gobject-introspection-data ldconfig
```

IMAGE_FEATURES 为

```xml
IMAGE_FEATURES = debug-tweaks dev-pkgs
```

在 x9sp 中，

```xml
DISTRO_FEATURES_remove = "x11 wayland directfb vulkan linux-libc-headers bluetooth "
```

不过最终 x9sp 需要使用到 wayland

## 28. taskhash mismatch for ....bb

将 bb 文件重新保存一下，然后 clean 和 cleansstate，重新编译

## 29. glibc 2.25 vs glibc 2.28

在 glibc 2.25 中的 nscd 会依赖 libnsl.so，但是 2.28 中没有该依赖

## 30. runqemu 出现错误

```cmake
runqemu - ERROR - runqemu-ifup: /workspace/wuzhenyu/test/poky/scripts/runqemu-ifup
runqemu - ERROR - runqemu-ifdown: /workspace/wuzhenyu/test/poky/scripts/runqemu-ifdown
runqemu - ERROR - ip: None
runqemu - ERROR - In order for this script to dynamically infer paths
 kernels or filesystem images, you either need bitbake in your PATH
 or to source oe-init-build-env before running this script.

 Dynamic path inference can be avoided by passing a *.qemuboot.conf to
 runqemu, i.e. `runqemu /path/to/my-image-name.qemuboot.conf`

 runqemu-ifup, runqemu-ifdown or ip not found
```

是因为 ip 命令没有找到，需要安装

```cmake
sudo apt-get install iproute2
```

### 出现 x11 not avaiable 的错误

```cmake
"Failed to run qemu: Could not initialize SDL(x11 not > available)"
```

通常远程通过 ssh 登录服务器时，使用 runqemu 的方式会出现这个错误。使用 nographic 参数，disable video console

```cmake
runqemu qemuarm64 nographic
```

## 31. pushd not found

使用 bitbake 进行构建，在环境变量中可以发现，SHELL 环境变量被 unset 了，此时打印 SHELL 是空的。
也就是说，通常我们使用的 bash 环境，不是 bitbake 中执行的环境，这个时候，在某些环境中，比如 dash 中 pushd 可能就不可用了。

![Alt text](/images/columns/yocto-problems/28.png)
bitbake 生成的 shell 脚本，比如 run.do_install 中，都是使用 `#!/bin/sh`解释器。但是此时，环境中的 sh 其实是 dash

```cmake
# ls -l /bin/sh
lrwxrwxrwx 1 root root 4 4月  28  2022 /bin/sh -> dash
```

pushd/popd 是 bash 的内建命令，dash 中不可用。导致脚本在执行 pushd/popd 时出现错误。
方案一：
使用 cd 命令替换 pushd/popd

```shell
# pushd
OLDPWD=$(pwd)
cd /path/to
...

# popd
cd ${OLDPWD}
```

方案二：
比较粗暴，直接将 sh 软链接链接到 bash 上

```shell
cd /bin
sudo ln -sf sh bash
```

## 32. perl 在编译 do_compile 时卡死

这是因为 yocto 在编译 perl 时，使用的是多进程编译的方式，make -jN，N 表示进程数量，默认是cpu的核数。但是 perl 源代码在使用多进程编译时会卡死。改成单进程编译即可，在 local.conf 中添加

```shell
PARALLEL_MAKE:pn-perl = "-j 1"
PARALLEL_MAKE:pn-perl-native = "-j 1"
PARALLEL_MAKE:pn-nativesdk-perl  = "-j 1"
```

指定 perl 的编译采用单进程的方式

## 33. rootfs 设置默认密码

````
# add default root passwd:root123
INHERIT += "extrausers"
EXTRA_USERS_PARAMS = "usermod -p '\$6\$TnZUoBWMqsy1icKF\$9k36On.tbhPMcnyCEsvUJP/oc3gc7rZpw4fDsedudJFZJKZL5.YENd2B6FgORsDmXd4kGbKrr8ljCBOILtBeO1' root"
````

## 34. No valid terminal found, unable to open devshell
这是因为当前环境中缺少 tmux 导致的，安装即可
```
sudo apt-get install tmux
```
大家好，我是吴震宇。前面的章节，我们讨论了 yocto 这个构建系统本身，同时还介绍了 yocto 中 recipe 的概念，recipe 的增删改查的方式，以及 image 的构建方式，同时还介绍了如何使用外部工具链来灵活配置不同的工具链。

今天针对童鞋们在实际操作可能遇到的一些问题，给出答疑。

## 1. CONF file 'conf/xxx/xxx.conf' not found

当编写了一个新的 layer，并添加了对应的 recipe，使用 bitbake 构建时却出现了上述文件找不到的问题。可以尝试从以下两个角度排查一下问题

- 编写的 layer 是否添加到了 `build/conf/bblayers.conf` 的 BBLAYERS 中
- 编写的 layer 的 `conf/layer.conf` 文件中的 BBPATH 是否正确

如果 layer 路径没有添加到 BBLAYERS 中，是不会生效的。同时 BBPATH 的值也一定要设置正确。通常可以按照如下方式设置

````
BBPATH .= ":${LAYERDIR}"
````

LAYERDIR 就是当前 layer 的路径，这是将当前 layer 的路径追加到整个 BBPATH 的后面，因为构建过程可能会使用到很多的 layer，bitbake 会逐个解析所有 layer 的 metadata。

`file not found` 的错误也可能是出现在寻找 patch 文件或者其他通过 SRC_URI 指定的文件的时候。bitbake 寻找路径是通过 FILESPATH 这个变量，以及扩展变量 FILESEXTRAPATH 来进行设置的，变量中的值是通过冒号分隔的，如果这两个变量中的路径搜索后都没有找到对应的文件，就会出现 `file not found` 的错误。可以通过日志的方式查看这两个变量的值。

分析 yocto 的构建问题，第一点就是查看日志。如果不知道日志位置在哪，就再回顾一下 chapter3 中讨论的 yocto 的工作流程，从 task 的角度来找到对应的日志文件。

## 2. 使用 clean 清除了某个 package 的编译后，再次编译仍然是相同的问题

bitbake 构建某一个 recipe 对应的 package 时，如果编译完成，在 `tmp/work/${PACKAGE_ARCH}-poky-${TARGET_OS}/xxx` 中保存所有构件完成的文件，包括编译生成的临时文件，最终的可执行文件或者库，以及打包的 rpm 文件等。同时还会再 sstate-cache 中保存。clean 命令只是清楚了 `tmp/work/${PACKAGE_ARCH}-poky-linux/${TARGET_OS}` 下的文件，sstate-cache 中的仍然保留，所以下次构建时，bitbake 直接使用了 sstate-cache 中的结果而没有重新进行构建，使得问题仍然存在。解决方式

```shell
bitbake -c clean xxx
bitbake -c cleansstate xxx
```

多个 target 可以使用空格隔开。cleansstate 会清除 sstate-cache 中的结果。

## 3. qemu-native 或者 qemu-system-native 执行 `do_configure` 或者 `do_compile` 任务时出错

bitbake 在构建时，除了少数几个 hosttools 依赖的本地环境外，大部分的工具都是通过源代码的方式自己构建出来的。这样做的好处是最大限度的减少了对主机操作系统环境的依赖，同时能够保证所使用的实用程序软件包的版本的一致性和统一性。当编译到 qemu-native 或者 qemu-system-native 时，经常会出现 `Killed` 的错误。

这是因为本机编译的内存不足，导致 gcc 在编译时出现了内存不足的错误，直接被操作系统将进程 kill 掉了。出现这个问题时，先暂停整体构建镜像，使用 bitbake 手动编译一下 qemu，比如

```shell
bitbake qemu-system-native -c compile -v
```

的方式手动编译。可能需要编译多次才能编译成功，因为中间可能会出现好几次这种错误。也可以直接手动直接 `run.do_compile` 脚本，修改一下 make 的参数，将 do_compile 函数中的 `make -j 64` 这种参数修改为 `make -j1` 或者合适的进程数的方式。

另一种解决方式，就是限制 bitbake 在构建时可以使用的进程数量，分别为 bitbake 和 make 的进程数量设置限制，在 bitbake 构建前，设置如下两个环境变量

```shell
export PARALLEL_MAKE="-j 4"
export BB_NUMBER_THREADS=4
```

如果需要为某一个 package 设置编译进程数的限制，比如 perl，可以 `local.conf` 中添加如下设置

````
PARALLEL_MAKE:pn-perl = "-j 2"
````

为 perl 设置的用于编译的进程数最大为 2

## 4. runqemu 时出现错误 'runqemu-ifup, runqemu-ifdown or ip not found'

出现如下错误

````
runqemu - ERROR - runqemu-ifup: /workspace/wuzhenyu/test/poky/scripts/runqemu-ifup
runqemu - ERROR - runqemu-ifdown: /workspace/wuzhenyu/test/poky/scripts/runqemu-ifdown
runqemu - ERROR - ip: None
runqemu - ERROR - In order for this script to dynamically infer paths
 kernels or filesystem images, you either need bitbake in your PATH
 or to source oe-init-build-env before running this script.

 Dynamic path inference can be avoided by passing a *.qemuboot.conf to
 runqemu, i.e. `runqemu /path/to/my-image-name.qemuboot.conf`

 runqemu-ifup, runqemu-ifdown or ip not found
````

这是因为当前环境中确实了 ip 命令。在 ubuntu 环境中，ip 是 iproute2 中的，安装即可

```shell
sudo apt install iproute2
```

## 5. runqemu 出现 x11 not avaiable 的错误

````
"Failed to run qemu: Could not initialize SDL(x11 not > available)"
````

当使用 terminal 通过 ssh 连接到远程服务器时，直接运行 `runqemu qemuarm64` 就可能会出现上述错误。因为 terminal 中也没法启动窗口，这种环境下，可以使用 nographic 参数，disable video console。

```shell
runqemu qemuarm64 nographic
```

## 6. ERROR: pushd not found

pushd 是 bash 内置命令，在 SHELL 环境变量为 `/bin/bash` 时，是可以直接使用的。但是在某些环境的 dash 下，是不支持 `pushd/popd` 命令的。

分析发现，bitbake 为 configure/compile/install 这些 task 生成的 shell 脚本中，使用的都是 `#!/bin/sh`，也就是 sh 解释器。而 sh 通常作为一个软连接指向 dash

```shell
# ls -l /bin/sh
lrwxrwxrwx 1 root root 4 4月  28  2022 /bin/sh -> dash
```

而当 dash 中不支持 `pushd/popd` 命令时，就可以看到类似下面的错误

![pushd not found](/images/columns/pushd-not-found.jpg)

解决思路一：将 recipe 中的 `pushd/popd` 命令，改成 cd 命令

```shell
# pushd
OLDPWD=$(pwd)
cd /path/to/dir
...

# popd
cd ${OLDPWD}
```

解决思路二：将 sh 改成是 bash 的软链接，不过这种方式比较粗暴。

```shell
cd /bin
sudo ln -sf bash sh
```

## 7. `do_rootfs` ERROR: locale-base-en-us locale-base-en-gb no provider

在构建定制化的 image 时，当执行到 `do_rootfs` task 时，bitbake 会调用 dnf 包管理工具，将 `IMAGE_INSTALL` 变量中指定的 package 相关的 RPM/DEB 包逐个安装到 rootfs 根文件系统中。在安装前，dnf 会先解析出这些二进制包的依赖关系，如果依赖关系错误，就会报错，显示安装失败，同时会终止 `do_rootfs` 这个 task。

如果出现 `no providers for locale-base-en-us locale-base-en-gb` 这种错误，是因为当前 image 的相关依赖包中，没有提供这两个语言包。

这两个语言包的设置是默认的，在 recipe 中如果没有设置 `IMAGE_LINGUAS` 变量，bitbake 就会默认设置上面的两个语言包。因为在 `meta/conf/distro/include/default-distrovars.inc` 设置了默认值

````
IMAGE_LINGUAS = "en-us en-gb"
````

将 `IMAGE_LINGUAS` 变量的值设置为空就去掉了。

````
IMAGE_LINGUAS = ""
````

## 8. perl 在编译 `do_compile` 任务执行时“卡死”

yocto 在构建 perl，执行到 `do_compile` 任务时，任务一直不结束，但是观察进程发现，该进程仍处于活跃状态，且上下文切换次数也正常。该情况再 5.34.0 版本发生。

这是因为 perl 源码编译，使用 `make -j N` 多进程的方式编译时，就会出现这种情况，此时只能使用单进程编译。

yocto 生成的 `do_compile` 脚本中，使用了 `make -j N` 方式编译，如果需要修改编译的进程数，可以修改 `local.conf` 中的 `PARALLEL_MAKE` 变量，指定 perl 编译使用单进程的方式进行编译

````
PARALLEL_MAKE:pn-perl = "-j 1"
PARALLEL_MAKE:pn-perl-native = "-j 1"
PARALLEL_MAKE:pn-nativesdk-perl = "-j 1"
````
你好，我是吴震宇。

前面几章，我们讨论了如何构建自己的嵌入式操作系统 image，使用 poky 本身的 recipe 和 layer 来构建的整体镜像和根文件系统。在编译时，bitbake 会根据 poky 中的 gcc 的 recipe 首先编译出一个可使用的交叉编译工具链出来，这个交叉编译工具链就是用来编译其他模版的工具链。整个过程都是由 poky 自己来维护的，然后通过 bitbake 读取 metadata 来分配任务并执行。

但是有时候我们会遇到这样的需求，那就是对工具链有自己的要求，比如硬件厂商对工具链有修改，或者做了一些针对性的优化，那么这个时候就不能使用 poky 中这种通过 recipe 源码编译的工具链了，而需要使用已经编译好的外部工具链。

今天讨论的主题就是如何在 yocto/bitbake 中使用外部工具链。

yocto 的官方网站 `https://git.yoctoproject.org/` 上提供了许多的开源的 layer，其中针对外部工具链的支持，也有一个专门的 layer 为 `meta-external-toolchain`。

`meta-external-toolchain` 可以支持对外部工具链的使用，使得 bitbake 在编译时，直接使用该 layer 配置的外部工具链进行编译，而不会再次通过 poky 中的 recipe 使用源代码编译一个 gcc 的交叉编译工具链。这种做法，
- 一方面可以灵活配置不同的外部工具链来进行编译；
- 另一方面，缩减了构建交叉工具链的时间，可以提高构建速度。

该 layer 可以通过 git clone 直接下载，下面列出的三种方式都可以。
```shell
# 1
git clone git://git.yoctoproject.org/meta-external-toolchain

# 2
git clone https://git.yoctoproject.org/meta-external-toolchain

# 3
git clone https://git.yoctoproject.org/git/meta-external-toolchain
```
我们来一起研究下这个 layer 的组成和实现，这也是 layer 的一种学习方式，从优秀的开源项目中进行学习和模仿，来实现我们自己的 layer。

## 使用方法
使用 `meta-external-toolchain` 这个 layer 很简单，在 `build/conf/bblayers.conf` 中的 BBLAYERS 中添加该 layer 的路径。(笔者使用的是 kirkstone 分支)
```
BBLAYERS += "/path/to/meta-external-toolchain"
```
同时，在 local.conf 中加入如下配置
```
TCMODE = "external"
EXTERNAL_TOOLCHAIN = "/path/to/gcc"
EXTERNAL_TOOLCHAIN_SYSROOT = "/path/to/sysroot"
# BASELIB = "lib64"
```
- TCMODE 为 bitbake 指定了使用的外部工具链的配置。详细解释请继续往下看。
- EXTERNAL_TOOLCHAIN 为外部工具链的路径，也就是交叉编译工具链的根目录，访问交叉工具链 gcc 可以通过 `${EXTERNAL_TOOLCHAIN}/bin/gcc` 的方式。
- EXTERNAL_TOOLCHAIN_SYSROOT 为外部工具链的 sysroot 路径。因为交叉编译都需要指定 `--sysroot` 参数，通常构建交叉工具链都会有自己的 sysroot，里面包含 gcc runtime，libc 等库和头文件。而 `meta-external-toolchain` 需要根据 sysroot 找到 gcc 和 libc 相关的头文件和库构建出可使用的交叉编译环境。
- BASELIB 在 bitbake.conf 中默认设置为 lib，如果是 64 位环境，建议设置成 lib64，这样更加规范，而且可以避免出现交叉编译时找不到库的错误。

设置完成后，再次使用 bitbake 进行构建时，使用的工具链就是 `EXTERNAL_TOOLCHAIN` 变量指定的工具链了。

## 实现原理
### TCMODE 变量的作用
在 yocto 中，使用外部工具链，需要在 local.conf 中指定 TCMODE 变量。默认情况下，bitbake 会使用自己构建出来的交叉工具链，而 TCMODE 就是告诉 bitbake 使用哪个工具链配置来进行编译。

在 `poky/meta/conf/bitbake.conf` 中定义了 TCMODE
```
TCMODE ??= "default"
TCLIBC ??= "glibc"
```
TCLIBC 表示 toolchain 的 libc，默认是 glibc。TCMODE 默认设置为 default。这样，bitbake 解析配置时，根据 `poky/meta/conf/distro/defaultsetup.conf` 配置
```
require conf/distro/include/tcmode-${TCMODE}.inc
```
会进一步去解析 `tcmode-default.inc` 这个配置文件，而该文件的实现在 `poky/meta/conf/distro/include/tcmode-default.inc` 中。该文件中指定了 gcc，binutils，g++ 等的最高优先级的 provider
```
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}binutils = "binutils-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}gcc = "gcc-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}g++ = "gcc-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}compilerlibs = "gcc-runtime"
PREFERRED_PROVIDER_gdb = "gdb"
```
`PREFERRED_PROVIDER` 变量表示一个优先级的变量，比如以第一行的 binutils 来说，如果当前构建环境中有多个 recipe 都设置了 `virtual/${TARGET_PREFIX}binutils` 的 PROVIDER，那么 bitbake 需要选择其中一个 recipe 来构建，否则就会出现歧义。而选择的规则就是根据优先级。
- PREFERRED_PROVIDER 变量指定的方式拥有最高优先级
- 而在 recipe 中设置 `DEFAULT_PREFERENCE = -1` 表示当前这个 recipe 不会被选择
- 优先级还可以通过 `PREFERRED_VERSION` 变量来指定不同版本的 recipe，比如 `PREFERRED_VERSION_gcc = "10.2.0"，那么 bitbake 会优先选择 `gcc_10.2.0.bb` 配方来构建 gcc
- 另外还可以通过 layer 中的优先级变量 `BBFILE_PRIORITY`，如果该变量的值比其他 recipe 所在的 layer 中的 `BBFILE_PRIORITY` 值大，那么该 recipe 就会被优先选择

上面第一行，表示 `virtual/${TARGET_PREFIX}binutils` 这个虚拟 PROVIDER 选择 PN 为 `binutils-cross-${TARGET_ARCH}` 的 recipe 提供相关的 metadata 信息来构建。

我们在上一小节的 「使用方法」 中，TCMODE 设置成了 external，所以 bitbake 此时寻找 `tcmode-external.inc` 配置文件进行解析，而该文件的定义就在 `meta-external-toolchain/conf/distro/include/tcmode-external.inc` 中，这个路径与 defaultsetup.conf 中指定的路径是一致的。在 `tcmode-external.inc` 中重新设置上面 PROVIDER 的优先级(这里只列出了部分)
```
# Prefer our recipes which extract files from the external toolchain
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}gcc ?= "gcc-external-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}gcc-intermediate ?= "gcc-external-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}g++ ?= "gcc-external-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}binutils ?= "binutils-external-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}compilerlibs ?= "gcc-runtime-external"
PREFERRED_PROVIDER_gcc-runtime = "gcc-runtime-external"
```
还是以 binutils 为例，此时 `virtual/${TARGET_PREFIX}binutils` 这个虚拟 PROVIDER 选择 PN 为 `binutils-external-cross-${TARGET_ARCH}` 的 recipe 提供相关的 metadata 信息来构建，而该配方就是 `meta-external-toolchain` 这个 layer 中定义的 `recipes-external/binutils/binutils-external-cross.bb`
```
PN .= "-${TARGET_ARCH}"
PROVIDES += "virtual/${TARGET_PREFIX}binutils"
```
可以看到 PN 后面加上了 `-${TARGET_ARCH}`，而 PROVIDER 就是上面我们解释的这个 `virtual/${TARGET_PREFIX}binutils`。

这就解释了为什么通过 TCMODE 这一个变量，就可以指定使用外部工具链的配置了。

### gcc-external-cross
通过 TCMODE 这个变量指定了使用的外部工具链配置，这样 bitbake 在构建交叉编译环境时就会将 CC 或者 CXX 设置成指定的外部工具链了，这是如何实现的呢。

在 `meta-external-toolchain` 中，`recipes-external/gcc/gcc-external-cross.bb` 就是 gcc 对应的 recipe 的实现。有两个关键的配置
```
require recipes-external/gcc/gcc-external.inc
inherit external-toolchain-cross
```
`gcc-external.inc` 中定义了描述信息的 metadata，同时设置了 `gcc_binaries` 这个变量的值，也就是 gcc 这个工具链可能使用到的一些二进制文件的集合，比如 gcc, g++, cpp, ar, nm 等。

而继承的 `external-toolchain-cross.bbclass` 中，定义了 `do_install` 的方式

![external toolchain do_install](/images/columns/external-toolchain-do-install.png)

`EXTERNAL_CROSS_BINARIES` 的值就是上面定义的 `gcc_binaries`，而 `do_install` 的目的就是将交叉编译工具链中实际的这些 binaries 通过 wrapper 成脚本的方式安装到 bitbake 的环境中进行调用。比如 `aarch64-linux-gnu-gcc`，就 wrapper 成了名为 `aarch64-linux-gnu-gcc` 脚本，脚本内容实际是调用 `EXTERNAL_TOOLCHAIN` 中指定的 gcc 进行编译。
```shell
exec ${EXTERNAL_TOOLCHAIN_BIN}/${EXTERNAL_TARGET_SYS}-gcc "$@"
```
binutils，gdb 和 gcc 都是这样来实现的。这种方式，减少了 bitbake 对外部工具链的 copy 操作，但是也存在一些问题。

**潜在问题1**：

如果外部工具链在 binutils 的构建时，使用了 `--enable-shared` 参数，那么 binutils 在执行时，需要先加载依赖的动态库，也就是需要工具链在执行前需要设置环境变量 `LD_LIBRARY_PATH` 将 binutils 依赖的动态库的路径加入到环境变量中。但是此处是通过 wrapper 脚本的方式来调用的，在 bitbake 中调用这个 wrapper 脚本时，设置 `LD_LIBRARY_PATH` 变量可能是一个潜在的问题，因为 bitbake 本身对环境变量有自己的处理方式。可以使用如下方式解决
```shell
# 在 wrapper 的脚本中加入对 LD_LIBRARY_PATH 的处理
export LD_LIBRARY_PATH=/path/to/library:${LD_LIBRARY_PATH}
exec ${EXTERNAL_TOOLCHAIN_BIN}/${EXTERNAL_TARGET_SYS}-gcc "$@"
```
这样就确保了调用 wrapper 脚本时，`LD_LIBRARY_PATH` 已经设置成功。

**潜在问题2**：

因为 `do_install` 时是 wrapper 的 一个脚本，所以最终打包制作成的 RPM/DEB 也只是一个脚本，这就导致最终生成 rootfs，安装依赖的 rpm 时，因为是脚本缺少实际依赖的库导致出错。

这个问题同样在执行 `do_populate_sdk` 生成 sdk 时也会遇到。而利用 bitbake 的 sstate-cache 机制，较少编译构建过程时，也是因为这个脚本，如果其他人利用这个 sstate-cache，会发现脚本中工具链的路径是绝对路径，换了环境后找不到实际的工具链而出现错误。

### glibc 配方的实现
glibc 配方负责 libc 相关的库，头文件以及 linux 系统头文件的构建。在 `recipes-external/glibc/glibc-external.bb` 中实现。

recipe 中同样继承了 `external-toolchain.bbclass`，而在该 bbclass 中关闭了 configure 和 compile，
```
do_configure[noexec] = "1"
do_compile[noexec] = "1"
```
因为 glibc 已经是编译好的了，不需要再次编译。其他继承 `external-toolchain.bbclass` 的 recipe 也是如此。那么要想使用编译好的 libc 库，重点就是 `do_install` 任务，将对应的头文件和库安装到 bitbake 能够使用的环境中。

![glibc do_install](/images/columns/glibc-do-install.png)

该 `do_install` 任务是通过 python function 的方式实现的。而 bitbake 中的 `bb.build.exec_func` 接口不仅可以调用 python function，还可以调用 shell function。

`glibc_external_do_install_extra` 就是在 `glibc-external.bb` 中定义的 shell function，而 `external_toolchain_do_install` 是在 `external-toolchain.bbclass` 中定义的 python function。

![copy from sysroot](/images/columns/external-toolchain-copy-from-sysroot.png)

该函数的实现中，使用了一个 `oe.external` 的 python module，这也是在 `meta-external-toolchain/lib/oe` 中实现的。bitbake 支持加载 python module 的方式，这种扩展方式能够利用 python 的生态，而且通过编程的方式来实现构建的过程可以非常灵活，我们后面再来详细讨论 bitbake 中的这种方式。

`lib/oe/external.py` 中的 `copy_from_sysroot` 函数，就是将 sysroot 中搜索到的文件，copy 到 bitbake 的构建环境中，installdest 也就是 `${D}`，即 `{WORKDIR}/image`。

![oe external copy_from_sysroot](/images/columns/oe-external-copy-from-sysroot.png)

而在 sysroot 中搜索的文件，是通过 FILES 变量指定

![glibc external FILES](/images/columns/glibc-external-FILES.png)

FILES 中指定了 linux 系统头文件的位置，即从 include 下的 `asm asm-generic bits drm linux mtd rdma sound video` 这些子目录中搜索。

FILES 中还指定了 libc 头文件，这些头文件记录在了 `libc.headers` 文件中，bitbake 读取该文件后，将值保存到 FILES 变量中。

也就是说，`meta-external-toolchain` 通过指定的 sysroot，以及配方中 FILES 指定的文件目录或者文件名，在构建过程中，通过 `do_install` 这个 task，将对应的文件 copy 到 bitbake 构建目录中，而跳过 configure 和 compile 这两个任务，也就是跳过了编译过程，直接将 prebuilt binaries 和头文件进行了安装。这也是一种利用 prebuilt binaries 的方式之一。

bitbake 官方文档中利用 prebuilt binaries 的方式是通过 fetch 的方式，通过 SRC_URI 指定预编译的文件的位置，然后通过 `do_fetch` 下载下来进行安装，两者思路类似，只是处理的阶段不同。

glibc 中的这种思路，也是我们在 bitbake 中使用外部 rootfs 的一种方式。

![glibc external do_install](/images/columns/glibc-copy-from-rootfs.png)

可能有同学会问，这种将文件从 sysroot 中拷贝过来的方式，会不会导致 bitbake 构建目录体积非常庞大？

是会有这个问题。所以有些同学可能会想到，那这里不 copy，直接使用 ln 的方式建立一个软连接不就可以了吗？

这是一个好问题，提出的方法也不错，在 bitbake 中使用这种方法确实可以用来提升编译的速度，但是在打包任务和制作镜像任务时这种方式就会发生错误。我们来分析一下。

**问题1**：

在 libc 中的 `libc.so` 和 `libpthread.so` 这两个文件，在很多场景下，只是一个链接脚本，比如
```
/* GNU ld script
   Use the shared library, but some functions are only in
   the static library, so try that secondarily.  */
OUTPUT_FORMAT(elf64-x86-64)
GROUP ( /lib/x86_64-linux-gnu/libc.so.6 /usr/lib/x86_64-linux-gnu/libc_nonshared.a  AS_NEEDED ( /lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 ) )
```
当链接时，链接器实际链接的是这个链接脚本里面的另外两个库，`libc.so.6` 和 `libc_nonshared.a`。

如果按照上述方式，建立一个 `libc.so` 这个链接脚本的软连接，那么在编译链接时，链接器可能会直接报错，显示找不到 `libc.so.6` 这个库，这也是因为软连接导致的，链接器通过链接脚本里的路径，在 sysroot 中寻找时没有找到。

> 注意：bitbake 在编译构建过程中，会自己指定 sysroot 为 `${RECIPE_SYSROOTS}`

所以对这几个链接脚本文件，不能直接使用软连接的方式，而是要将其 copy 到 bitbake 构建目录中。

**问题2**：

因为 `do_install` 时 install 到 D 中的都是文件的软连接，而实际的文件都是在 sysroot 中，那么在打包制作成 RPM/DEB 时，打包进去的都是文件的软连接，可能会导致生成 RPM 包的 .spec 文件中 Provides 字段为空或者不正确。

**问题3**：

因为问题 2 生成的 DEB/RPM 包有问题，在 `do_rootfs` 这个任务中，dnf 安装 rootfs 所需要的依赖包时，会因为 Provides 的依赖问题而出错，dnf 无法正确解析出所有包的依赖关系，导致任务失败。

同时因为安装包中都是软连接，而不是实际的文件，也会出现问题。

综上，最好还是使用 copy 的方式，直接将文件 copy 到 bitbake 构建目录中，这样就不会出现这些潜在的问题了。

## 内容小结
本章我们介绍了 yocto 中如何使用外部工具链的方式，通过 `meta-external-toolchain` 这个 layer，以 TCMODE 的方式指定既可以使用我们自己的外部工具链。同时，讨论了 `meta-external-toolchain` 的实现原理，以及可能存在的潜在问题。

因为是外部编译好的工具链，所以在对应的 recipe 中，忽略了 configure 和 compile 这两个任务环节，直接通过 install 任务，将外部工具链中的头文件和 binaries 拷贝到 bitbake 的构建目录中。而 copy 的方式会导致构建目录变得非常大，所以我们又讨论了使用软连接的方式，以及这种实现方式存在的问题。

留给大家一个思考题，在 `meta-external-toolchain` 这个 layer 的实现中，用到了非常多的变量，比如
- TARGET_SYS
- TARGET_OS
- EXTERNAL_TARGET_SYS
- TARGET_PREFIX
- TARGET_ARCH
你能分清楚这些变量的实际含义吗？欢迎在留言区与我讨论。

如果觉得本文对你有帮助，欢迎分享给你的朋友。

## reference
1. [Sharing Functionality](https://docs.yoctoproject.org/bitbake/2.6/bitbake-user-manual/bitbake-user-manual-metadata.html#sharing-functionality)
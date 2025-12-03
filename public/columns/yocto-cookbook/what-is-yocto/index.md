你好，我是吴震宇。

大家在平时的开发和学习过程中，无论碰到什么项目，想要让项目能够运行起来的第一件事，就是构建这个项目。比如 c/c++ 工程，就是要组织源代码文件，通过编译器将源代码文件翻译成可执行的二进制文件才能运行。那么，构建工具是什么呢？

构建工具（Build Tools）是软件开发中用于自动化处理编译代码、打包、测试和部署应用程序的工具和系统。在程序开发过程中，尤其是大型项目，需要处理成千上万个源代码文件和库，构建工具能够帮助开发者自动化这些繁琐的过程。通常包括多个步骤，例如：
- 编译链接，即调用工具链对源代码文件进行编译，生成可执行的二进制文件或者字节码文件。
- 资源打包，将应用程序所需的资源文件 (如图像、音频、配置文件等) 整合到一起。
- 依赖管理，自动下载并集成项目所需的第三方库或组件。
- 运行测试，根据预先配置或者编写的测试集自动运行单元测试、集成测试或者其他验证代码正确性的测试。
- 部署应用，根据预先配置的环境，在测试通过之后自动将应用程序部署到测试环境。

![构建](/images/columns/cons_process.png)

从上面的描述中，也能看出构建工具与工具链的区别。工具链，比如 GNU 工具链，是指包括编译器、汇编器、链接器等在内的工具集合。而构建过程中，编译只是其中一个步骤，是将程序翻译成目标代码。构建工具通过配置工具链环境，调用工具链来完成这一步的工作。

不同的编程语言和开发环境通常有各自的构建工具或构建系统，以下是一些常见的构建工具：
1. GNU 构建系统，主要是指通过 autoconf、automake、libtool 这三个工具构建出来的软件结构体系，又称为 autotools。通常和 GNUmake、gettext 以及 gcc 一起配套使用。这个软件结构体系也是 GNU 项目的打包方式。
2. MSBuild，用于.NET和Visual Studio项目的构建工具，曾经是 .NET 的一部分，从 visual studio 2013 开始成为 visual studio 产品的组件之一。主要用于帮助软件产品创建流程的自动化，包括编译、打包、测试、部署和创建文档。使用 MSBuild 可以在不安装 visual studio IDE 的情况下构建 visual studio 项目和解决方案。
3. Maven 是一个软件项目管理及自动构建工具，它使用XML格式的pom.xml文件来描述项目结构和依赖关系。
4. Gradle，一个用于Java项目的构建和依赖管理工具，它使用XML格式的pom.xml文件来描述项目结构和依赖关系。
5. CMake，一个跨平台的构建工具，它使用自己的配置文件（CMakeLists.txt）来生成标准的构建文件，例如Makefile或者Visual Studio的项目文件。
6. Ant，另一个用于Java项目的构建工具，它使用XML文件作为构建脚本。

构建工具非常多，还有 ros2 系统中使用的 colcon，gstreamer 中使用的 meson 等。

![tools collections](/images/columns/constructure_tools.png)

在 linux 系统中，makefile 是一个非常普遍的描述构建过程的文件，使用 make 工具来自动管理项目的编译和链接流程。在 autotools 中，可以通过 configure 的方式，通过配置和自动 check 的方式生成对应的 makefile 文件。在 cmake 中，通过 CMakeLists.txt 配置来生成对应的 makefile 文件。这些工具就类似对 makefile 的封装，只不过是将 makefile 的编写简化了，或者增加了更多新的特性来生成对应的 makefile 文件。

还有一些构建工具，利用了动态语言的特性，比如 meson，colcon 就是使用 python 语言编写的构建工具。可以通过 python 语言，以编程的方式实现对构建过程的管理，同时能够直接使用 python 的生态，使得构建过程更加灵活。

但是无论是哪种构建工具，编译过程都是通过调用工具链来完成的。

那么 yocto 作为一个构建系统，是如何来实现编译，打包，测试和部署的呢？

## what is yocto
yocto 项目将自己定义为 ”一个开源协作项目，提供了模版、工具集和方法来帮助开发人员创建基于 Linux 的定制化系统“。有点类似于桌面发行版的概念，但是要更加通用和抽象一点，可以理解成是 meta-distribution，因为可以根据这些 recipe，配置项，依赖项的集合来完成特定需求的 Linux 定制化系统镜像，相当于 programmable 的概念。

简单理解 yocto 就是一个构建系统，能够自动化的完成一个嵌入式操作系统镜像所包含的所有模块的源代码下载，patch 应用，编译，打包，制作镜像等完整的过程。在 yocto 中，配置是分模块管理的，每一个模块就是一个独立的 layer，所以一个完整的构建是由多个不同的 layer 共同完成的。这就使得开发人员可以通过这些 layer 配置，以及 yocto 提供的工具集和开发环境，灵活的创建基于 Linux 的定制系统。

而一个 layer 中，又是由许多称之为 recipe 的配置文件来组成的，每一个 recipe 代表一个 package，也就是一个软件包。recipe 中保存的是一些 metadata，比如软件包的名称、版本、依赖、源码地址，configure 任务配置，compile 任务配置等。

![yocto key dev elements](/images/columns/yocto-key-dev-elements.png)

上面这张图就是 yocto 的核心组成成分。可以看到最核心的部分就是 poky。poky 是 yocto 项目的参考发行版 (the Yocto Project Reference Distribution)。包含了 OpenEmbedded 构建新系统以及相关的 metadata。这些 metadata 就是上面我们所说的 layer 和 recipe。开发人员可以利用 poky 来快速构建自己的发行版操作系统。换句话说，poky 就是一个嵌入式操作系统基本功能的一个规范或者模版，是开始定制化的一个起点。展开 poky 可以看到很多的 meta- 前缀的 layer。

```
├── bitbake
├── contrib
├── documentation
├── LICENSE
├── LICENSE.GPL-2.0-only
├── LICENSE.MIT
├── MAINTAINERS.md
├── Makefile
├── MEMORIAM
├── meta
├── meta-poky
├── meta-selftest
├── meta-skeleton
├── meta-yocto-bsp
├── oe-init-build-env
├── README.hardware.md -> meta-yocto-bsp/README.hardware.md
├── README.md -> README.poky.md
├── README.OE-Core.md
├── README.poky.md -> meta-poky/README.poky.md
├── README.qemu.md
└── scripts
```

> Poky 最初是一个开源项目，最初由 OpenedHand 公司开发。OpenedHand 公司基于 OpenEmbedded 构建系统开发出了 Poky，目的是为构建嵌入式操作系统发行版本提供商业化的构建支持。英特尔公司收购 OpenedHand 后，将 poky 变成了 yocto 构建系统的基础组成部分。

在 poky 中，执行整个配置的解析、任务创建、任务调度和任务执行的过程是通过 bitbake 这个工具来完成的。bitbake 是由 python 实现的一个任务执行器和调度器，也是 OpenEmbedded 构建系统的核心部分。

> BitBake 最初是 OpenEmbedded 项目的一部分。它的灵感来自于 Gentoo Linux 发行版使用的 Portage 包管理系统。 2004 年 12 月 7 日，OpenEmbedded 项目团队成员 Chris Larson 将项目分为两个不同的部分：
> - bitbake，任务执行器和调度器
> - OpenEmbedded， 能由 bitbake 使用的一组 metadata 的集合，也就是各种 meta layer 的集合

在 bitbake 之前，没有其他构建工具能充分满足嵌入式 Linux 系统发行版的各种定制化的需求，而传统桌面 Linux 发行版使用的所有构建系统都缺乏重要的功能，并且嵌入式领域中流行的基于 Buildroot 的临时系统都不是可扩展或可维护的。这尤其凸显了 bitbake 的先进性和必要性，能够熟练掌握 bitbake 也是一个很有优势的能力。

我们通过一个简单的例子，通过构建 core-image-minimal 这个最小的 linux image 来了解整个构建过程。

## a simple example
### 搭建构建环境
搭建 yocto 构建需要在 linux 环境下。因为 bitbake 在运行时首先需要检查 gcc runtime 的库 libgcc_s.so，window 或者 mac 下默认是没有这个库的。

![bitbake check libgcc](/images/columns/bitbake-libgcc-require.png)

> 这里解释一下为什么 mac m1 上不支持 yocto？
> 
> 因为 gcc 主线还没有针对 m1 的后端，所以使用 gcc 编译是无法翻译成可运行在 mac m1 上的可执行文件的。也就是说如果需要在 mac m1 上运行，需要使用 clang 编译 gcc 的源代码，target 设置为 arm m1，这样编译出来的 libgcc_so.so 才能在 mac m1 上运行。但是如果是 mac 系统，动态库的后缀是 `.dylib`，所以仍然无法支持。
> 当然，如果想使用 gcc 支持 m1，也是可以的。github 上的仓库 [gcc-darwin-arm64](https://github.com/iains/gcc-darwin-arm64) 支持了 mac m1 后端。如果想体验，可以使用这个尝试一下。

基础环境说明，可以参考 [yocto quick build](https://docs.yoctoproject.org/brief-yoctoprojectqs/index.html)。我们快速安装一下必要的软件。

```shell
sudo apt install gawk wget git diffstat unzip texinfo gcc build-essential chrpath socat cpio python3 python3-pip python3-pexpect xz-utils debianutils iputils-ping python3-git python3-jinja2 libegl1-mesa libsdl1.2-dev python3-subunit mesa-common-dev zstd liblz4-tool file locales libacl1
```
安装完成后，使用 git 下载 poky 仓库
```shell
git clone git://git.yoctoproject.org/poky
```
如果 yocto 官网的下载链接很慢，可以使用 github 上的镜像仓库
```shell
git clone https://github.com/yoctoproject/poky.git
```
> 考虑到国内网络环境，如果 github 也很慢，可以去 gitee 上找找。不过作为程序员，这点网络问题相信对大家来说都是小菜一碟，毕竟我们还需要经常访问 yocto 的官方文档。

这样就搭建好了 yocto 构建环境了。来尝试构建一下 core-image-minimal 这个镜像。

### 构建 core-image-minimal
使用 bitbake，需要先设置环境变量。进入到 poky 目录，执行
```shell
mkdir ../build && cd ../build
source ../poky/oe-init-build-env .
```
`.` 表示当前目录，也就是 build 目录。执行结束后，环境变量就设置好了，同时会在 build 目录下生成 conf 目录，保存的就是 bitbake 生成的配置文件
```
.
├── bblayers.conf
├── local.conf
└── templateconf.cfg
```
- bblayers.conf 用来配置 meta layer 的路径
- local.conf 用来配置构建镜像的一些参数，architecture 信息等
- templateconf.cfg 记录了模版文件的路径，比如 `meta-poky/conf` 表明当前 bblayers.conf 和 local.conf 这两个配置文件的模版在 `poky/meta-poky/conf` 中。在该目录中，两个以 `.sample` 结尾的文件就是模版文件。

列一下我的 local.conf 的配置
```
MACHINE ??= "qemuarm64"
DISTRO ?= "poky"
PACKAGE_CLASSES ?= "package_rpm"
EXTRA_IMAGE_FEATURES ?= "debug-tweaks"
USER_CLASSES ?= "buildstats"
PATCHRESOLVE = "noop"
BB_DISKMON_DIRS ??= "\
    STOPTASKS,${TMPDIR},1G,100K \
    STOPTASKS,${DL_DIR},1G,100K \
    STOPTASKS,${SSTATE_DIR},1G,100K \
    STOPTASKS,/tmp,100M,100K \
    HALT,${TMPDIR},100M,1K \
    HALT,${DL_DIR},100M,1K \
    HALT,${SSTATE_DIR},100M,1K \
    HALT,/tmp,10M,1K"
PACKAGECONFIG:append:pn-qemu-system-native = " sdl"
CONF_VERSION = "2"
```
将 MACHINE 设置成了 qemuarm64，这样构建成功后，可以通过 qemu 将镜像运行起来。

使用 bitbake 运行
```shell
bitbake core-image-minimal
```
可以加上 `-v` 参数，看到 bitbake 执行的任务的日志信息。

![bitbake task](/images/columns/bitbake-running-tasks.jpg)

上图就是 bitbake 在执行这个构建任务过程中执行的 task 信息。可以发现，当前构建 core-image-minimal 这个镜像共有 1391 个 task，当前有 53 个 task 在运行中。举个例子
```
4: unzip-native-16.0-r5 do_patch - 13s (pid 98995)
```
- 4 表示当前执行中的 task 的序号
- unzip-native-16.0-r5 表示当前 task 对应的 package name 以及版本，这里有一个 `-native` 表示构建的是 unzip 的 host 版本，而不是 target 版本。说明是本地编译，不是交叉编译。
- do_patch 表示当前 task 的名称，这是一个打补丁的任务
- 13s 表示当前 task 花费的时间，这个时间不一定是执行中的时间，还包括等待的时间。
- pid 就是当前执行的这个 task 的进程号，需要查看日志时，可以直接通过这个 pid 后缀找到对应的日志文件。

初次编译会比较慢，因为 bitbake 需要根据 recipe 中的 metadata，逐个下载源代码，如果没有在 local.conf 通过 `DL_DIR` 变量设置本地源代码目录，bitbake 默认将下载的源代码保存到 `build/downloads` 目录中。

构建时间比较久的另一个原因，是 yocto 构建时首先会构建许多 host 本机实用程序。这样做可以最大程序的减少对主机操作系统环境的依赖，同时能确保使用的本机实用程序的软件包版本的一致性和统一性。之后才会继续构建交叉编译环境，来构建目标平台的二进制文件。这样也会花费很多时间。

编译结束后，可以将 downloads 保存起来，下次编译时通过 `DL_DIR` 指定到该 downloads 目录，这样就省去了下载源代码的步骤。

bitbake 构建会在 build 目录中生成很多临时文件，
- sstate-cache 中保存的是 shared state cache. 这个文件夹可以直接提供给其他编译直接复用，省去编译相同模块的时间。在 bitbake 构建过程中也可以发现，当一个软件模块已经构建完成时，下次构建，就是直接从 sstate-cache 中获取构建好的文件解压缩出来的。
- tmp 目录中保存的就是整个编译构建过程中使用到的所有相关文件，包括编译好的软件包，以及编译过程中产生的中间文件，以及工具链和根文件系统，镜像等。

> 注意 [important]: 构建过程中遇到的问题，在后面答疑章节会有详细的分析和解决思路，如果遇到问题不要慌，可以直接去答疑章节找一找。实在解决不了，在评论区留言，我会尽快回复大家。

#### tmp 目录
大家可以看到我上面列出的 local.conf 的配置，`PACKAGE_CLASSES` 我使用的是 `package_rpm`，也就是说，在构建过程中，会将编译好的软件包打包成 rpm 包。这些会统一存放一份到 `tmp/deploy/rpm` 中。

- log 中保存的是日志，遇到问题，首先就是要去查看日志信息，定位问题具体发生的位置
- hosttools，是本地工具的软连接，bitbake 在构建过程中需要使用的本地环境中的相关工具都会在该目录中建立软连接
- work 就是我们重点关注的目录，这里面就是实际需要编译的软件包，包括源代码，补丁文件，编译的临时文件，生成rpm文件等。
  - x86_64-poky-linux 是 native 版本的软件包
  - coretexa57-poky-linux 是 target 版本的软件包
  - qemuarm64-poky-linux 是 target 版本的 kernel，image。

当构建成功后，进入到 `tmp/work/qemuarm64-poky-linux/core-image-minimal/1.0-r0` 目录，可以看下 core-image-minimal 这个 target 构建的任务列表，也就是 `temp/log.task_order` 这个文件
```
do_prepare_recipe_sysroot (26710): log.do_prepare_recipe_sysroot.26710
do_rootfs (97733): log.do_rootfs.97733
do_flush_pseudodb (103929): log.do_flush_pseudodb.103929
do_write_qemuboot_conf (103932): log.do_write_qemuboot_conf.103932
do_image_qa (103944): log.do_image_qa.103944
do_image (103958): log.do_image.103958
do_image_ext4 (103970): log.do_image_ext4.103970
do_image_tar (103973): log.do_image_tar.103973
do_image_complete (104081): log.do_image_complete.104081
do_populate_lic_deploy (104099): log.do_populate_lic_deploy.104099
```
从任务列表可以看出，生成了根文件系统，image 镜像。而整个 rootfs 根文件系统也非常小，只有 7.6M。

### 运行镜像
使用 runqemu 命令运行镜像，可以参考 [Using the Quick EMUlator](https://docs.yoctoproject.org/dev-manual/qemu.html)
```
runqemu qemuarm64
```
出现解决不了的问题，到后面的答疑章节搜索一下，针对问题会有详细的分析和解决方法。

成功运行起来后，会进入到登录界面，使用 root 账号无密码访问即可。(无密码是 image 的 feature 配置方式之一，这个在 chapter4 中会介绍)。

![runqemu core-image-minimal](/images/columns/runqemu-core-image-minimal.jpg)

这样，一个很小的 Linux 嵌入式操作系统镜像就完成并运行起来了。如果有新的功能需求，可以往镜像中添加行的软件，然后重新构建即可。

## 内容小结
yocto 是一个开源协作工具，能够帮助开发人员很快的构建基于 Linux 的定制化操作系统。Poky 作为 yocto 的基本组成部分，提供了一个基本的操作系统功能规范。在此基础上，可以通过增删改 layer 的方式，定制化自己的操作系统镜像，通过 bitbake 构建工具完成对 image 的构建。

## reference
1. [why the yocto project for my iot project](https://www.embedded.com/why-the-yocto-project-for-my-iot-project/)
2. [poky core components introduction](https://docs.yoctoproject.org/ref-manual/structure.html#top-level-core-components)
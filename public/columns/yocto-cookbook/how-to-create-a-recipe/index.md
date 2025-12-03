大家好，我是吴震宇，这次的主题是如何创建一个新的配方 recipe。

在 bitbake 中，以 bb 文件作为后缀的文件称之为 recipe，中文翻译为配方。这个翻译其实挺有意思，比如某一道佳肴的配方，表示的是这道菜最关键的制作方法。而 bitbake 中的配方，也表示了某一个软件模块特有的编译，打包，部署等的实现。为了表述方便，后面统一使用 recipe。

在 c/c++ 的项目中，通常都是使用的 cmake 或者 make 工具来构建，而 makefile 就是描述这个工程项目构建的配置文件。recipe 也是类似的概念，就相当于 makefile。不过 recipe 中的描述信息更加丰富，在 bitbake 中有一个专门的术语，来表示这些描述信息，叫做 metadata。

## recipe 中的 metadata
### 描述信息
在 bitbake 或者 yocto 中，是以 package 为单位，也就是说，一个 recipe 描述的是一个 package 的信息。首先，recipe 中会有关于该 package 的描述信息。
```
SUMMARY = ""
DESCRIPTION = ""
HOMEPAGE = ""
LICENSE = ""
SECTION = ""
```
LICENSE 表示当前 package 使用的开源协议，比如 MIT, GPL-2.0-or-later 等。而 SECTION 变量是用来指定当前 package 构建的软件包所属的分类的。通过这种分类，可以帮助用户更容易的找到他们想要的软件包。比如在嵌入式 linux 系统中，软件可以分为
- base 基础软件包，包括操作系统内核、基本工具链和其他必要的基础组件。这种就类似在 yum 源中看到的 base-os 中的软件列表
- devel 表示开发包，包含开发工具，开发库，头文件，调试器等。
- doc 包含文档和手册 manpage。
- libs 包含共享库和静态库。这个与 devel 的区别是 libs 中的库都是带有版本号的库，而 devel 中实际都是软连接库，不带有版本，表示的运行时的库。
- networking 网络相关的软件包，服务等。

### 版本信息
recipe 还会包含版本信息。这个版本信息可以理解成 recipe 的版本号，通常是与 package 的版本保持一致的，这样更好维护。
```
PN = "package-name"
PV = "1.0.0"
```
PN 表示 package name，比如我们需要编译 flex，那么 PN 就可以写成 flex。

PV 表示 package version，上面的 1.0.0 就表示版本号，从这里就知道，我们是在编译 flex-1.0.0 版本的源代码。

这里需要解释一下 recipe 文件名称与版本之间的关系。加入我们需要编译 flex 1.0.0 版本，recipe 文件名称可以写成 `flex_1.0.0.bb`，这样 bitbake 就会自动将 PN 和 PV 设置成
```
PN = "flex"
PV = "1.0.0"
```
当然，也可以在 recipe 文件中专门设置成其他的值。bitbake 解析的原则是以下划线 `_` 作为分隔符的，如果 recipe 的名称是 `flex-1.0.0.bb`，那么 bitbake 就会将 PN 设置成 `flex-1.0.0`，而 PN 就会设置成一个默认值。

我们在 recipe 中会经常碰到 target 和 native 的概念，target 表示交叉编译，native 表示 host 本地编译。而在两种不同的编译环境下，PN 的名称会有所不同，比如 target 环境中，PN 可能为
- flex
- flex-aarch64
- .....

而在 native 环境中，PN 通常为 `flex-native`，所以如果想要统一都使用 flex 这个名称，可以使用 BPN 这个变量，bitbake 解析后 BPN 设置的就是 flex 这个值。

### 依赖信息
recipe 中还会包含依赖信息。就是说当前我们的 package 能够编译成功，需要准备哪些 host 工具，哪些库，哪些头文件。比如需要交叉编译 flex，需要依赖
- flex 本地工具
- bison 本地工具
- libc 库和头文件
bitbake 中使用 gcc 编译，libc 相关的依赖都是默认的，其他依赖通过 DEPENDS 变量来指定
```
DEPENDS += "flex-native bison-native"
```
因为编译 flex 依赖的是 host 工具，所以加上一个 `-native` 后缀，这样 bitbake 就会知道这是一个 host 工具，需要首先检查并安装这两个工具。

DEPENDS 描述的是编译时依赖，RDEPENDS 描述的是运行时依赖，runtime dependencies。

运行时依赖在制作 package 的 RPM/DEB 安装包时会进行指定。那么在 do_rootfs 中如果安装了该 package 的 RPM/DEB，包管理器就会根据 dependencies 进行检查，检查 RDEPENDS 中指定的依赖是否存在，如果不存在，包管理器会认为安装条件不满足，中断安装过程。

### 源代码和patch文件
recipe 中描述了待编译的源代码的来源以及相关的 patch 文件，都是通过 SRC_URI 变量来指定的。

#### 源代码来自 git 服务器
如果 SRC_URI 中指定的源代码来自 git 服务器，需要指定 git url，仓库的分支名 branch，以及使用的协议 protocol。
```
SRCREV = "b1e7b8196c22e39743f567a1bd90792288d736c4"
SRC_URI = "git://gitee.com/src-anolis-os/libnl3.git;branch=a8.8;protocol=https \
```
上面这段代码表示 libnl3 的位置来自 git 服务器，分支名为 a8.8，使用的协议为 https。SRCREV 表示当前 git 仓库的 commit id，也就是说源码下载只会下载到这个 commit id 的版本。

这里使用了 https 是因为 git 服务器在 https 协议上是可以支持匿名下载的，如果是 git 协议，需要输入用户名和密码，或者将当前机器的 public key 设置到 git 服务器上，通过 ssh key 的方式验证下载。

还有一种方式，如果使用了 https 协议仍然需要输入用户名，可以在后面添加一个参数，表示用户名，密码，比如
```
SRC_URI = "git://gitee.com/src-anolis-os/libnl3.git;branch=a8.8;protocol=https;user=username:password"
```
如果在 username 或者 password 中存在特殊字符，比如 `@`，需要将 username 和 password 进行一下编码，可以通过如下的命令进行
```shell
printf %s ${1} | xxd -plain | tr -d '\n' | sed 's/\(..\)/%\1/g'
```
`${1}` 表示待编码的字符串。

#### 源代码来自远程服务器中的压缩包
如果源代码是远程 ftp 服务器中的压缩包，也可以直接使用 SRC_URI 来指定，bitbake 会自动检查路径并使用 wget 进行下载。
```
SRC_URI = "https://github.com/westes/flex/releases/download/v${PV}/flex-${PV}.tar.gz \"
SRC_URI[sha256sum] = "e87aae032bf07c26f85ac0ed3250998c37621d95f8bd748b31f15b33c45ee995"
```
如上，SRC_URI 中直接指定了 flex 源代码在服务器上的位置，bitbake 运行时会自动下载，并验证该文件的 sha256sum 的值是否与指定的一致，如果不一致，返回错误并中断当前 task。

#### 源代码来自本地
如果源代码来自本地的文件夹，需要通过 EXTERNALSRC 变量的方式来指定。
```
inherit externalsrc
EXTERNALSRC = "${TOPDIR}/source/flex-${PV}"
```
通过继承 externalsrc，然后使用 EXTERNALSRC 变量来指定源代码在本地中的路径。externalsrc 中会自动设置 S 变量为该路径，也就是指定源代码的路径。同时设置 EXTERNALSRC_BUILD 的默认路径为 `${WORKDIR}/${BPN}-${PV}`，WORKDIR 就是构建目录下当前配方对应模块的路径，这样做的目的，就是将本地源代码与编译后的产物隔离开，避免编译过程中产生的临时文件污染源代码。如果希望将源代码与编译后的产物放在一起，可以将 EXTERNALSRC_BUILD 设置成 `externalsrc` 相同的路径。

上述这些源代码的指定方式，是可以同时混合使用的，比如在 SRC_URI 中指定了源代码的路径来自 git，但是还需要一些依赖的库来自压缩包，另有一些来自本地的文件夹，
```
SRC_URI = "giturl \
ftpurl;name=url1 \
ftpurl;name=url2
"
SRC_URI[url1.sha256sum] = "e87aae032bf07c26f85ac0ed3250998c37621d95f8bd748b31f15b33c45ee995"
SRC_URI[url2.sha256sum] = "f87bae091bf07c26f85ac0ed3250998c37621d95f8bd748b31f15b33c45ee9d5"
```
SRC_URI 中指定了源代码的路径，同时还指定了另外两个压缩包的路径，bitbake 会自动 clone，并使用 wget 下载 url1 和 url2 的压缩包。name 表示一个 tag，可以用来代表这两个 url，在 SRC_URI 中使用这两个 name 分别为这两个压缩包设置不同的 checksum 值以示区分。name 可以是任何不同的唯一标识。

#### patch 文件
patch 文件的路径，也是通过 SRC_URI 变量来指定的。
```
SRC_URI = "${SOURCEFORGE_MIRROR}/libpng/${BPN}/${PV}/${BPN}-${PV}.tar.xz \
           file://remove.ldconfig.call.patch \
           file://Makefile-runtests.patch \
          "
```
bitbake 在下载完源代码后，会自动检查 SRC_URI 中指定的 patch 文件，并将其应用到源码中。apply patch 的过程，是在 do_patch 这个 task 中完成的，bitbake 首先会检查 patch 的类型，来决定是通过 quilt 还是 git 的方式将 patch 应用到源码中。

patch 文件的路径，是通过 `file://` 的方式指定的，表示本地中，相对于变量 `FILESPATH` 的相对路径。bitbake 如果搜索不到该 patch 文件，会报错。通常，bitbake 会将当前 recipe 所在路径下的名为 `${BPN}` 作为一个子目录进行搜索。如果使用 bbappend 的方式，在 bbappend 文件中有相关的 patch 文件，可以通过
```
FILESEXTRAPATHS:append = "/patch/path/to:"
```
的方式来指定 patch 文件的搜索路径，这种方式就是为 bitbake 额外增加了新的搜索路径来查找 patch 文件。

### 编译 do_configure 和 do_compile
`do_configure` 和 `do_compile` 是 bitbake 中内置的两个 task，表示配置和编译任务。在 `do_configure` 可以指定配置参数，可以使用脚本或者其他程序来生成编译时所需的配置文件。也就是说，在进行编译前的所有准备工作都可以在该 task 中进行。`do_compile` 就是实际调用工具链进行编译的操作。

如果源代码是通过 autotools 的方式来配置和编译的，在 autotools.bbclass 中实现了 `do_configure`，也就是调用 configure 脚本来生成 makefile。而 `do_compile` 则是调用 make 进行编译。

### 安装和分包
在 recipe 中还有一种 metadata，通过 FILES 变量来指定。
```
FILES:${PN} = "${bindir}/test"
FILES:${PN}-dev = "${libdir}/libtest.so \
${includedir}"
```
FILES 变量必须要指定对应的 PN，因为这个是与当前 package 相关的变量，而不是全局的。通过上面的方式可以看到，FILES 可以指定为多个文件和目录。

当编译任务 `do_compile` 完成时，bitbake 默认会为当前 package 分配 `do_install` 的任务，将编译产物安装到指定位置。而安装的文件，就是 FILES 变量指定的文件，安装的路径，就是 FILES 变量中指定的路径加上 `${D}` 前缀，默认就是 `${WORKDIR}/image`。

安装任务结束时，再通过 `do_package` 这个 task 进行打包。如果 bitbake 配置中使用的是 rpm 的打包方式，那么会在 `${WORKDIR}` 中生成 `${BPN}.spec` 文件。而文件中的分包方式，也是按照 FILES 变量中指定的方式来的。比如 BPN 是 test，那么上面例子中的分包，会分成 test.rpm 和 test-dev.rpm 这两种包，实际 rpm 包名不会这么简单，还会加上对应的版本号，aarch 平台等信息。同时 test 文件会打包到 test.rpm 中，而对应的库和头文件会打包到 test-dev.rpm 中，如果有语言包的话，bitbake 还会生成不同语言包对应的 rpm，同时还有调试所用的 test-dbg.rpm 文件。

制作 RPM/DEB 是通过 `do_package_write_rpm` 或者 `do_package_write_deb` 这两个 task 来完成的。

在 recipe 中保存了很丰富的 metadata 信息，bitbake 利用这些 metadata 信息为不同的 package 进行构建。但是一个嵌入式操作系统中会存在很多的 packages，当然也就需要很多的 recipe 来描述这些 packages。如何管理这些不同种类的 recipe，这就牵涉到 layer 的概念。

## layer
layer 包含了许多的 recipe，可以理解成某一类或者某一个特定目的的 recipe 的集合，比如使用外部工具链的 `meta-external-toolchain`，或者使用 clang 编译器的 `meta-clang` 等等。

每一个 layer，都会有一个 `conf/layer.conf` 配置文件，来指定当前 layer 的一些基本配置。
- BBPATH 指定了当前 layer 的路径
- BBFILES 指定了当前 layer 包含的可以正常使用的 recipe 的集合1j
- BBFILE_PRIORITY 指定了当前 layer 包含的 recipe 的优先级，优先级越高，bitbake 会优先使用该 recipe
- LAYERSERIES_COMPAT 指定了当前 layer 兼容的 poky 的系列，也就是 poky 的版本，比如 honister, kirkstone 等

使用 layer 的方式进行分类，起到了一个模块化的作用，能够很好的进行分类和维护，以及扩展。

既然 layer 包含了许多的 recipe，那么如果我需要对 layer 中的某一个 recipe 进行修改或者扩展需要怎么办呢，这就需要使用到 bitbake 中的 bbappend 机制了。

## bbappend
bbappend 机制是 bitbake 中用来对 recipe 进行扩展的机制。比如对名为 `flex_1.31.bb` 的 recipe 进行扩展，在该 recipe 所在目录，或者在你自己自定义的新的 layer 中与 `flex_1.31.bb` 同级的目录中创建一个 `flex_%.bbappend` 的文件，flex 就是 PN，而 `%` 表示通配，无论版本是多少，都会使用该 bbappend 文件。

可以使用
```
bitbake-layers show-appends
```
的方式来查看所有的 bbappends，以确保当前创建的 bbappend 文件是有效的。在 `flex_%.bbappend` 文件中就可以对该 recipe 进行修改和扩展了，这里的编写语法与 recipe 是完全一致的。

## recipe 中的基本语法介绍
在 poky 中，老版本中的语法是通过下划线作为分割，而新版本是通过 `:` 冒号来进行分割的。后面的例子中，都是采用的新版本的语法的方式。

recipe 中的基本语法，在 [syntax and operators](https://docs.yoctoproject.org/bitbake/bitbake-user-manual/bitbake-user-manual-metadata.html) 一章可以查看。这里介绍一下一些特殊的语法规则，在后面我们会经常使用到这些语法规则。

### 变量中经常使用的 operators
在变量中，经常使用 append, prepend, remove 这三个 operators，分别介绍一下。
- append 表示追加，不包含空格，可以直接使用 `.=` 来代替
比如
```
FOO = "abc"
FOO:append = "efg"
```
最终 FOO 的值 expand 后为 abcefg，没有空格

- prepend，表示在之前追加，也不包含空格，可以使用 `=.` 来代替
- remove，删除变量中所有出现该字符串的位置
- +=，=+ 操作符也是追加，但是在追加时，会额外添加一个空格
比如
```
FOO = "abc"
FOO += "efg"
FOO =+ "hij"
```
使用 += 后，FOO 的值 expand 为 `abc efg`，而使用 =+ 后，expand 为 `abc efghij `。前者在追加前追加 space，后者在追加内容后添加 space。

### 变量针对特定 OVERRIDES 的操作
OVERRIDES 是一个特殊的变量，可以用于表示条件覆盖。比如
```
OVERRIDES += "sesame"
FOO = "abc"
FOO:append:sesame = "efg"
```
首先 FOO 的值 expand 为 abc。如果 OVERRIDES 中不包含 sesame，那么 append 后 FOO 的值仍然是 abc。但是此时，OVERRIDES 中包含了 sesame，`FOO:append:sesame` 这个变量，在 此时是条件有效的，也就是说需要 override 重写这个 FOO 变量在 OVERRIDES 包含 sesame 这个值的条件下，FOO expand 为 abcefg。

### 变量针对特定 pn 的操作
pn 在前面介绍过，就是 package name，而可以对变量针对特定的 pn 进行赋值。
```
TOOLCHAIN:pn-flex = "gcc"
```
这句话的意思是说，TOOLCHAIN 这个变量，在 package name 为 flex，也就是 flex 的 recipe 中赋值为 gcc。这样 bitbake 在处理 flex 的 recipe 时，TOOLCHAIN 变量的值 expand 为 gcc。就可以针对具体的 pn 做不同的操作了。

### 变量针对特定 task 的操作
bitbake 支持为某一个 task 设置变量的值。
```
FOO:task-configure = "val 1"
FOO:task-compile = "val 2"
```
在上面的例子中，执行 `do_configure` 时 FOO 的值设置为 `val 1`，执行 `do_compile` 时 FOO 的值设置为 `val 2`。此时，变量的设置也是可以支持 OVERRIDE 操作的。

### 在 shell/python 函数后也可以添加 prepend,append
对同名的函数直接定义，比如
```
do_configure() {
  ...
}
```
表示重新定义了新的 `do_configure` 的实现。如果使用 `:prepend`，那么 bitbake 会将这段代码追加在 `do_configure` 的实现之前，比如
```
do_configure:prepend() {
  echo "hello world"
}
```
最终的 `do_configure` 的实现为
```
do_configure() {
  echo "hello world"
  # do_configure original implementation
  ...
}
```
如果使用了 `:append`，bitbake 会将这段代码片段追加到 `do_configure` 的实现后面。

### inherit/require/include
这是 bitbake 中的三个关键字(directive)，分别表示继承，引入，包含。在 [sharing functionality](https://docs.yoctoproject.org/bitbake/2.6/bitbake-user-manual/bitbake-user-manual-metadata.html#sharing-functionality)章节中有详细介绍。

inherit 表示继承，可以在配方中通过 inherit 继承某一个 .bbclass 文件，可以继承该 bbclass 中的变量和函数实现。而 bbclass 中的实现的变量，可以在 bb 文件中进行修改。就相当于在编程语言中的函数调用的概念，传入参数就得到了不同的结果。

require 和 include 相同，bitbake 会将该语句指定的文件(.inc)插入到语句所在的位置进行解析。这就类似于 c/c++ 中的 include 头文件的扩展，将文件 include 进来后组成一个完成的 translation unit 单元。

require 和 include 的不同之处在于，require 中指定的文件，如果不存在会报错。

bitbake 使用 BBPATH 变量指定的路径作为搜索路径，为 inherit/require/include 搜索指定的文件。BBPATH 变量就类似于环境变量 PATH，通过冒号的方式分隔。

### class-target 和 class-native
无论是变量还是函数中，都经常能看到 target 和 native 这样的关键字。target 表示当前变量或者函数的定义是针对交叉编译目标平台的，而 native 表示是针对 host 平台的。
```
do_install:append:class-target() {
  ...
}

do_install:append:class-native() {
  ...
}
```
这两个 do_install 的实现，使得 bitbake 在执行 `do_install` 任务时，需要区分 是目标平台还是 host 平台的任务，两个任务的处理方式可以有不同的实现。

以上这些，是 bitbake 中的一些比较常见，但是初次接触起来比较难理解的一些语法。了解了这些语法规则，再来阅读 poky layer 中的 recipe 就简单多了。

那么就来添加一个简单的 recipe 吧。

## 添加一个 recipe
前面一小节我们分析了 recipe 中包含的 metadata 信息，而添加一个新的 recipe 就是需要将这些 metadata 信息补充完整。按照 metadata 的信息，创建一个新的 recipe 的基本过程如下

![create a new recipe](https://docs.yoctoproject.org/_images/recipe-workflow.png)

bitbake 提供了几个工具用来创建 recipe，可以通过 devtool 或者 recipetool 工具来辅助创建，然后修改其中的 metadata 信息即可。这些工具在设置好环境变量，也就是执行完 `source oe-init-build-env` 命令后就可以直接使用了。

另一种方式，就是直接手动创建了。为了方便演示，我们直接在 `poky/meta/recipes-example` 目录中创建一个 `sesame-hellworld`，该目录中本身存在一个 `rust-hello-world` 的例子。
```
.
├── rust-hello-world
│   ├── rust-hello-world
│   │   └── 0001-enable-LTO.patch
│   └── rust-hello-world_git.bb
└── sesame-helloworld
    ├── sesame-helloworld
    │   └── helloworld.c
    └── sesame-helloworld.bb
```
创建了一个 `sesame-helloworld.bb` 的 recipe，同时写了一个 helloworld.c 的源代码文件用于编译。helloworld.c 文件很简单，就是简单输出了一个 "HelloWorld, Sesame!!!" 字符串。而 recipe 中就是填充对应的 metadata 信息
```
SUMMARY = "Hello World for test"
LICENSE = "MIT"

DEPENDS = ""

LIC_FILES_CHKSUM = "file://${COMMON_LICENSE_DIR}/MIT;md5=0835ade698e0bcf8506ecda2f7b4f302"

SRC_URI = "file://helloworld.c"

do_compile() {
  mv ${WORKDIR}/helloworld.c ${S}
  ${CC} ${LDFLAGS} helloworld.c -o helloworld
}

do_install() {
  install -d ${D}${bindir}
  install -m 0755 helloworld ${D}${bindir}
}
```
最上面就是描述信息，DEPENDS 为空，因为这个很简单的 sample 不需要什么其他额外的依赖，libc 的依赖会默认处理的，因为使用到了 gcc 工具链，就肯定会有这个依赖。

`LIC_FILES_CHKSUM` 这个变量表示的是源代码中 LICENSE 文件的 checksum 值，bitbake 会根据指定的文件的路径首先找到这个 LICENSE 文件，然后计算 cksum 值后在与 `LIC_FILES_CHKSUM` 中指定的值进行比较来判断是否符合。这里直接使用了 poky 中自带的 MIT 协议的 LICENSE 文件，文件名就是 MIT。`COMMON_LICENSE_DIR` 变量在 `meta/conf/distro/include/default-distrovars.inc` 中进行了定义
```
# Set of common licenses used for license.bbclass
COMMON_LICENSE_DIR ??= "${COREBASE}/meta/files/common-licenses"
```
实际路径，就是 `poky/meta/files/common-licenses`。

`do_compile` 和 `do_install` 分别重写了这两个 task 的操作。在 `do_compile` 中，需要先将 helloworld.c 移动到 S 中，是因为 SRC_URI 指定的源代码文件，通过 `do_unpack` 任务后会被保存到 `${WORKDIR}` 中，也就是 `build/tmp/work/cortexa57-poky-linux/sesame-helloworld/1.0-r0` 中，而 S 就是 `build/tmp/work/cortexa57-poky-linux/sesame-helloworld/1.0-r0/sesame-helloworld` 目录。`do_compile` 会默认进入 S 后再进行编译操作，如果没有将源代码移动过来，就无法找到编译的源代码文件了。

`do_install` 则是将编译好的 helloworld 程序安装到 `${D}${bindir}` 目录下，也就是 `${WORKDIR}/image/usr/bin` 中。

使用 bitbake 进行编译构建
```
bitbake sesame-helloworld -v
```

![hello world](/images/columns/helloworld.png)

这样就完成了对 helloworld 的构建。因为编译出来的 helloworld 是 arm64 上的一个可执行文件，在 host 机器上无法执行，我们可以将这个 elf 文件添加到前面构建的的 `core-image-minimal` 镜像中，然后使用 qemu 运行起来。

修改 `meta/recipes-core/images/core-image-minimal.bb`，添加 `sesame-helloworld`
```
CORE_IMAGE_EXTRA_INSTALL += " sesame-helloworld"
```
添加完成后，重新构建 `core-image-minimal`
```
bitbake core-image-minimal -v
```
通过日志查看 `sesame-helloworld` 是否被添加到了镜像中，可以在 `do_rootfs` 这个 task 的日志中找到相关信息
```shell
$ grep helloworld build/tmp/work/qemuarm64-poky-linux/core-image-minimal/1.0-r0/temp/log.do_rootfs
...
---> Package sesame-helloworld.cortexa57 1.0-r0 will be installed
 sesame-helloworld              cortexa57    1.0-r0            oe-repo    8.0 k
  Installing       : sesame-helloworld-1.0-r0.cortexa57                   27/27
  Verifying        : sesame-helloworld-1.0-r0.cortexa57                   22/27
Installed: sesame-helloworld-1.0-r0.cortexa57
  sesame-helloworld-1.0-r0.cortexa57
```
这表示 `sesame-helloworld` 已经被添加到了 rootfs 中了，如果镜像构建成功，那说明也已经加入到了镜像之中了。我们使用 runqemu 将镜像运行起来，然后看下 helloworld 是否已经在镜像中了

![helloworld in core-image-minimal](/images/columns/helloworld-image.png)

可以发现，helloworld 已经安装到了 `usr/bin` 中了。

## 内容小结
yocto 中的配置文件，以模块的形式，组成了一个一个有特定功能的独立的 layer，这样可以很方便的复用和扩展。而 layer 又是由一个一个与 package 对应的 recipe 组成的，recipe 中保存了每一个 package 相关的 metadata 信息，包括描述，版本信息，依赖信息，LICENSE 信息，源代码信息以及编译和安装相关的操作等。

本文提供了一个简单的例子，展示了如何添加 recipe，并通过修改 recipe 的方式将 helloworld 添加到了 core-image-minimal 镜像中，不需要烧写到开发板，通过 qemu 的方式就可以很方便的进行验证。

如果觉得文章对你有帮助，也欢迎分享给你的朋友。

## reference
1. [bitbake manual intro](https://docs.yoctoproject.org/bitbake/2.6/bitbake-user-manual/bitbake-user-manual-intro.html)
2. [writing a new recipe](https://docs.yoctoproject.org/dev-manual/new-recipe.html)
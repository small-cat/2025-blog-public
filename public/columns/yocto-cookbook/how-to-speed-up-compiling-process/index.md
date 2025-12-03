大家好，我是吴震宇。

yocto 构建系统构建一个嵌入式系统镜像，往往非常耗时。相信大家都经历过，在第一次构建，从 yocto 服务器下载源代码的过程非常缓慢。同时，整个构建过程是全源码构建，如果软件包多，重复构建也是一个非常耗时的过程。

今天我们来聊聊，针对上述这两个问题，有哪些方式可以加快整个构建过程。

## 高效获取源代码的方式

yocto 构建系统在获取源代码时，首先寻找的是本地 download 目录，如果目录中不存在，bitbake 就会使用 `PREMIRRORS` 变量配置的 url，从上游服务器下载，如果仍然失败，就从 `MIRROR` 中指定的位置下载。

这也是 bitbake 在 download 时下载源代码的顺序。bitbake 中通常会调用如下类似的代码来下载源代码

````
src_uri = (d.getVar('SRC_URI') or "").split()
fetcher = bb.fetch2.Fetch(src_uri, d)
fetcher.download()
````

当 fetcher 调用 download 函数时，bitbake 会尝试从下面这三个角度来解析 URL

- Pre-mirror Sites: bitbake 首先从 pre-mirrors 中指定的 url 处来查找源代码文件，这些 url 是由 `PREMIRRORS` 变量指定的。
- Source URI：如果 pre-mirror 查找失败，bitbake 会尝试从 `SRC_URI` 变量指定的 URL 中获取源代码文件
- Mirror Sites：如果上述两种方式都失败，bitbake 此时会从 `MIRROR` 变量指定的 url 处来查找源代码文件。

download 函数定义在了 `poky/bitbake/lib/bb/fetch2/__init__.py` 中。

在构建时，如果本地没有找到源代码文件，yocto 就会按照上述顺序从 url 中 fetch 源代码文件，如果是 git 仓库，会通过 clone 的方式获取指定分支和指定 commit id 的代码。但是这个下载过程往往比较慢，很耗费时间。

一个比较好的办法，就是提前准备好所有的源代码文件。假如你在使用其他构建系统时，就已经准备好了一份源代码文件，那么可以通过配置的方式，直接为 yocto 指定源代码文件的来源，

````
SOURCE_MIRROR_URL ?= "file:///home/you/your-download-dir/"
INHERIT += "own-mirrors"
BB_GENERATE_MIRROR_TARBALLS = "1"
````

`SOURCE_MIRROR_URL` 变量，定义了一个 `PREMIRRORS`，使得 yocto 优先从该 URL 中 fetch 源代码文件，而不是从 `SRC_URI` 指定的 url 中获取。使用该变量的同时，还必须全局继承 `own-mirrors.bbclass`，看下 `own-mirrors.bbclass` 的实现

````
PREMIRRORS:prepend = " \
cvs://.*/.*     ${SOURCE_MIRROR_URL} \
svn://.*/.*     ${SOURCE_MIRROR_URL} \
git://.*/.*     ${SOURCE_MIRROR_URL} \
gitsm://.*/.*   ${SOURCE_MIRROR_URL} \
hg://.*/.*      ${SOURCE_MIRROR_URL} \
bzr://.*/.*     ${SOURCE_MIRROR_URL} \
p4://.*/.*      ${SOURCE_MIRROR_URL} \
osc://.*/.*     ${SOURCE_MIRROR_URL} \
https?://.*/.*  ${SOURCE_MIRROR_URL} \
ftp://.*/.*     ${SOURCE_MIRROR_URL} \
npm://.*/?.*    ${SOURCE_MIRROR_URL} \
s3://.*/.*      ${SOURCE_MIRROR_URL} \
crate://.*/.*   ${SOURCE_MIRROR_URL} \
"
````

就是在 `PREMIRRORS` 前通过 prepend 的方式，添加了新的 url，而这些 url 都是 `SOURCE_MIRROR_URL`。

`BB_GENERATE_MIRROR_TARBALLS` 变量设置为 1，yocto 会为所有的 git 仓库创建 tarballs。

通过上述这种方式，yocto 在构建时，首先会检查本地中已经准备好的源代码文件，可以大大缩短构建过程。

当然，还有一种方式，就是通过 yocto 构建系统，提前将所有源代码文件下载好，后续使用时，直接使用本地已经下载好的源代码文件。

yocto 默认的源代码文件的存放路径为 `build/downloads`，该路径可以通过 `DL_DIR` 变量指定。而 bitbake 也提供了专门用于下载源代码而不执行的命令。

````
DL_DIR = "/path/to/downloads"
BB_GENERATE_MIRROR_TARBALLS = "1"
````

指定源代码文件保存的路径，同时，指定 yocto 将所有 git 仓库打包成 tarballs。然后执行下载命令

````
bitbake target --runall=fetch
````

下载好后，后面需要 yocto 构建时，可以通过 `DL_DIR` 直接使用即可。

## 缓存

yocto 支持全量从头编译，能够保证构建结果的状态是最新的状态。全量构建好处是所有结果都是最新的状态，但是也非常的费时。yocto 中提供了一种 shared state cache 的机制，能够使得构建过程以增量构建的方式进行，这样能大大缩减构建时间。

shared state cache 会缓存各个 bitbake 任务的输出，并将这些与代表任务输入的 hash code 相关联起来。通过跟踪这些数据，yocto 可以复用这些已经构建好的输出结果，而不是再次重新进行编译，以此来提高构建速度，达到增量构建的效果。

yocto 中 shared state cache 保存在 `SSTATE_DIR` 变量指定的路径中，默认路径为 `${TOPDIR}/sstate-cache`。

````
SSTATE_DIR = "/path/to/sstate-cache"
````

在构建时，如果 yocto 识别出给定的一个任务存在一个 sstate 的对象时，yocto 就会使用该任务的一个 setscene 变体来替换该任务，也就是说将 cache 中构建好的输出结果直接 copy 到任务指定输出路径中。

与 `DL_DIR` 变量类似，shared state cache 目录也可以从 build 目录中独立出来，同时可以提供给所有其他用户用于在当前机器上进行构建，实现共享的目的。

sstate-cache 还可以通过 mirror 的形式共享给他人，使用 `SSTATE_MIRRORS` 变量来指定。

````
SSTATE_MIRRORS ?= "file://.* https://sstate.yoctoproject.org/all/PATH;downloadfilename=PATH"
````

当 yocto 完成一个一个构建任务时，会在 `build/tmp/stamps` 目录中创建对应的 stamp 文件，yocto 正是通过这些 stamp 文件来确定任务是否需要重新运行，来达到增量构建的效果。

stamp 文件是 `Zstandard compressed data` 格式的压缩文件，可以通过 bitbake-dumpsig 来查看文件内容，比如

````
bitbake-dumpsig 2.5.1-r0.do_fetch.sigdata.1fcb9f7da51b4e1bb3aca5dcdec71c7bdd80300f1448e7ef18c9b5254d87ec93
basehash_ignore_vars: ['BBPATH', 'BBSERVER', 'BB_CURRENTTASK', 'BB_HASHSERVE', 'BB_LIMITEDDEPS', 'BB_TASKHASH', 'BB_UNIHASH', 'BB_WORKERCONTEXT', 'BUILDHISTORY_DIR', 'BUILD_ARCH', 'CCACHE', 'CCACHE_DIR', 'CCACHE_NOHASHDIR', 'CCACHE_TOP_DIR', 'COREBASE', 'DEPLOY_DIR', 'DL_DIR', 'EXTERNAL_TOOLCHAIN', 'FILE', 'FILESEXTRAPATHS', 'FILESPATH', 'FILE_DIRNAME', 'GIT_CEILING_DIRECTORIES', 'HOME', 'LICENSE_PATH', 'LOGNAME', 'OMP_NUM_THREADS', 'PARALLEL_MAKE', 'PATH', 'PKGDATA_DIR', 'PRSERV_DUMPDIR', 'PRSERV_DUMPFILE', 'PRSERV_HOST', 'PRSERV_LOCKDOWN', 'PSEUDO_IGNORE_PATHS', 'PWD', 'SDKPKGSUFFIX', 'SHELL', 'SOURCE_DATE_EPOCH', 'SSTATE_DIR', 'SSTATE_HASHEQUIV_METHOD', 'SSTATE_HASHEQUIV_OWNER', 'SSTATE_HASHEQUIV_REPORT_TASKDATA', 'SSTATE_PKGARCH', 'STAGING_DIR_HOST', 'STAGING_DIR_TARGET', 'STAMPCLEAN', 'STAMPS_DIR', 'THISDIR', 'TMPDIR', 'USER', 'WARN_QA', 'WORKDIR', 'extend_recipe_sysroot']
taskhash_ignore_tasks: []
Task dependencies: ['BP', 'BPN', 'PN', 'PV', 'SPECIAL_PKGSUFFIX', 'SRCREV', 'SRC_URI', 'SRC_URI[sha256sum]', 'base_do_fetch', 'do_fetch[network]']
basehash: ff7f3c67037b1c6c96a1af95152a941938691cd00206db6d505ea751c98adddc
List of dependencies for variable BP is ['BPN', 'PV']
List of dependencies for variable BPN is ['PN', 'SPECIAL_PKGSUFFIX']
List of dependencies for variable PN is []
List of dependencies for variable PV is []
List of dependencies for variable SPECIAL_PKGSUFFIX is []
List of dependencies for variable SRCREV is []
List of dependencies for variable SRC_URI is ['BP', 'SRC_URI[sha256sum]']
List of dependencies for variable SRC_URI[sha256sum] is []
List of dependencies for variable base_do_fetch is ['SRC_URI']
List of dependencies for variable do_fetch[network] is []
Variable BP value is ${BPN}-${PV}
Variable BPN value is ${@oe.utils.prune_suffix(d.getVar('PN'), d.getVar('SPECIAL_PKGSUFFIX').split(), d)}
Variable PN value is ${@bb.parse.vars_from_file(d.getVar('FILE', False),d)[0] or 'defaultpkgname'}
Variable PV value is 2.5.1
Variable SPECIAL_PKGSUFFIX value is -native -cross -initial -intermediate -crosssdk -cross-canadian
Variable SRCREV value is INVALID
Variable SRC_URI value is ${SAVANNAH_GNU_MIRROR}/attr/${BP}.tar.gz            file://run-ptest
Variable SRC_URI[sha256sum] value is bae1c6949b258a0d68001367ce0c741cebdacdd3b62965d17e5eb23cd78adaf8
Variable base_do_fetch value is
    src_uri = (d.getVar('SRC_URI') or "").split()
    if not src_uri:
        return

    try:
        fetcher = bb.fetch2.Fetch(src_uri, d)
        fetcher.download()
    except bb.fetch2.BBFetchException as e:
        bb.fatal("Bitbake Fetcher Error: " + repr(e))

Variable do_fetch value is     bb.build.exec_func('base_do_fetch', d)

Variable do_fetch[network] value is 1
Tasks this task depends on: []
This task depends on the checksums of files: [['run-ptest', 'd4cd3373f25cf79926945a75695c307d']]
Computed base hash is ff7f3c67037b1c6c96a1af95152a941938691cd00206db6d505ea751c98adddc and from file ff7f3c67037b1c6c96a1af95152a941938691cd00206db6d505ea751c98adddc
Computed task hash is 1fcb9f7da51b4e1bb3aca5dcdec71c7bdd80300f1448e7ef18c9b5254d87ec93
````

stamp 文件中包含有 checksum 值，该 hash 值是通过 task 的输入计算出来的，如果输入发生变化，checksum 值也会发生改变，yocto 检测到这种变化后，就会重新执行该任务。生成 checksum 值可以通过 `BB_SIGNATURE_HANDLER` 变量指定的方法来进行计算，这些叫做签名处理程序。

- OEBasicHash，poky 默认的签名处理程序
- OEEquivHash，该签名处理程序需要配置哈希等效服务器(bitbake-hashserv)
  - BB_HASHSERVE 指定连接到哪个服务器，默认值为 auto，yocto 将在需要时启动本地服务器
  - BB_HASHSERVE_UPSTREAM 指定远程哈希服务器  
    yocto 默认优先使用本地服务器，在使用远程服务器。

有些 BSP 厂商会提供可下载的 shared state cache，通过添加配置就可以直接使用

````
BB_SIGNATURE_HANDLER = "OEEquivHash"
BB_HASHSERVE = "auto"
BB_HASHSERVE_UPSTREAM = "typhoon.yocto.io:8687"
SSTATE_MIRRORS ?= "file://.* https://sstate.yoctoproject.org/all/PATH;downloadfilename=PATH"
````

如果远程服务器已经关闭了，那么将 signature handler 设置为 OEBasicHash，同时将 BB_HASHSERVE 设置为空

````
BB_SIGNATURE_HANDLER = "OEBasicHash"
BB_HASHSERVE = ""
````

## 编译加速

在 yocto 构建系统中，编译只是其中一个 task，从整个构建过程来看，编译不是性能瓶颈，但是对大规模的软件来说，编译过程还是非常耗时的，比如 linux kernel，gcc 工具链，glibc 源代码等。yocto 也提供了几个变量，可以控制进行多线程多进程的方式构建。

- `BB_NUMBER_THREADS` 表示 bitbake 能够同时执行的最大线程数
- `BB_NUMBER_PARSE_THREADS` 表示 bitbake 在解析器 recipe 时能够使用的最大线程数
- `PARALLEL_MAKE` 表示 bitbake 在执行 `do_compile` 任务时，调用 make 进行编译时，传递给 make 的 `-j` 的参数，该变量控制 make 进行编译时的进程数
- `PARALLEL_MAKEINST` 表示 bitbake 在执行 `do_install` 任务时，调用 make 进行安装时可以使用的进程数

前两个是控制 bitbake 启动的线程数，通过环境变量的方式使用。

````
export BB_NUMBER_THREADS=16
export BB_NUMBER_PARSE_THREADS=16
````

后两个变量，可以在 local.conf 中进行设置

````
PARALLEL_MAKE = "-j 16"
PARALLEL_MAKEINST = "-j 16"
````

为了最大化提升编译效率，还可以搭建分布式编译，使用 ice 或者 distcc 之类的分布式编译的工具，搭建多服务器的编译环境，进一步加速编译过程，缩短 `do_compile` 任务的时间。

## 内容小结

本章讨论了加速 yocto 构建过程的几种方式，为了最大化的缩减构建时间，可以将上述几种方式有效的结合起来同时使用。

- 使用本地源代码 `SOURCE_MIRROR_URL`
- 使用 shared state cache
- 配置 bitbake 多线程
- 设置 make 编译多进程编译
- 搭建分布式编译环境

如果你还有其他更好的方式，欢迎在评论区分享。

## reference

1. [https://docs.yoctoproject.org/ref-manual/faq.html#how-does-openembedded-fetch-source-code-will-it-work-through-a-firewall-or-proxy-server](https://docs.yoctoproject.org/ref-manual/faq.html#how-does-openembedded-fetch-source-code-will-it-work-through-a-firewall-or-proxy-server)
2. [https://docs.yoctoproject.org/dev-manual/efficiently-fetching-sources.html](https://docs.yoctoproject.org/dev-manual/efficiently-fetching-sources.html)
3. [https://docs.yoctoproject.org/bitbake/2.6/bitbake-user-manual/bitbake-user-manual-fetching.html#the-download-fetch](https://docs.yoctoproject.org/bitbake/2.6/bitbake-user-manual/bitbake-user-manual-fetching.html#the-download-fetch)
4. [https://docs.yoctoproject.org/ref-manual/variables.html](https://docs.yoctoproject.org/ref-manual/variables.html)
5. [https://docs.yoctoproject.org/overview-manual/concepts.html#shared-state](https://docs.yoctoproject.org/overview-manual/concepts.html#shared-state)
6. [https://docs.yoctoproject.org/dev/dev-manual/speeding-up-build.html](https://docs.yoctoproject.org/dev/dev-manual/speeding-up-build.html)
7. [https://www.thegoodpenguin.co.uk/blog/improving-yocto-build-time/](https://www.thegoodpenguin.co.uk/blog/improving-yocto-build-time/)


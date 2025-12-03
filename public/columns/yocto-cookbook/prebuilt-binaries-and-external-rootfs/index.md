大家好，我是吴震宇。

bitbake 在构建一个 package 时，首先会通过 `do_fetch` 任务获取源代码，然后解压缩后，通过 `do_configure` 和 `do_compile` 两个任务进行编译，之后呢，还会使用 `do_package` 任务进行打包，使用 `do_write_package_rpm/deb` 制作成 rpm/deb 包。

那如果是一个已经预先编译好的库，就不需要 `do_configure` 和 `do_compile` 两个任务了，直接使用 `do_install` 任务就可以。这也是 prebuilt libraries 的处理方式。

而获取 prebuilt binaries 的方式，可以通过 `do_fetch` 任务，还可以从指定的 sysroot 中获取，而不同方式，对应 bitbake 中的 task list 也不相同。下面我们分别来介绍一下两种不同的方式。

## prebuilt binaries from `do_fetch`

`do_fetch` 任务，根据 SRC_URI 指定的 url 链接，可以从 git 服务器，或者本地文件系统或者 http 服务器中下载文件，如果是压缩文件，可以通过 xz 进行解压缩到构建目录 `${WORKDIR}` 中。  
比如

````
SUMMARY = "FTDI FT4222H Library"
SECTION = "libs"
LICENSE_FLAGS = "ftdi"
LICENSE = "CLOSED"

COMPATIBLE_HOST = "(i.86|x86_64).*-linux"

SRC_URI = "file://libft4222-linux-${PV}.tgz"

S = "${WORKDIR}"

ARCH_DIR:x86-64 = "build-x86_64"
ARCH_DIR:i586 = "build-i386"
ARCH_DIR:i686 = "build-i386"

INSANE_SKIP:${PN} = "ldflags"
INHIBIT_PACKAGE_STRIP = "1"
INHIBIT_SYSROOT_STRIP = "1"
INHIBIT_PACKAGE_DEBUG_SPLIT = "1"

do_install () {
        install -m 0755 -d ${D}${libdir}
        oe_soinstall ${S}/${ARCH_DIR}/libft4222.so.${PV} ${D}${libdir}
        install -d ${D}${includedir}
        install -m 0755 ${S}/*.h ${D}${includedir}
}
````

上述就是一个使用 prebuilt libraries 的 recipe。因为是 prebuilt libraries，设置 LICENSE 为 CLOSED 表示私有协议。同时 SRC_URI 指定了本地的压缩包，作为 prebuilt libraries 的源文件。

COMPATIBLE_HOST 变量，指定了该 recipe 所支持的硬件架构。该参数是为了指定 prebuilt libraries 支持的硬件架构，防止用户在构建时，指定了不支持的硬件架构，导致编译链接时发生错误。而通过 recipe 的方式，在 bitbake 解析 recipe 时就能够检查出是否支持该硬件架构。

`INSANE_SKIP` 变量，是一种抑制 `do_package_qa` 任务报错的方式，使得 `do_package_qa` 任务对 ldflags 相关的问题不报错，仅仅认为是 warning。因为此处使用了 prebuilt libraries，不会使用编译器进行编译链接，所以 ldflags 相关的检查可能会报错。

当编译结束时，`do_install` 会将 binaries 安装到 `${WORKDIR}/image` 文件夹中，而 `do_package` 和 `do_populate_sysroot` 任务，一个是将 binaries copy 到 package 目录中，一个是将 binaries copy 到 `destdir-sysroot` 中。这两个任务默认情况下，都会对二进制文件进行 strip，这也是为什么 image 中的二进制文件，与依赖的 package 中 `recipe-sysroot/` 下的文件不同的原因。

而通过 `INHIBIT_PACKAGE_STRIP` 和 `INHIBIT_SYSROOT_STRIP` 这两个变量，可以阻止 bitbake 对二进制文件进行 strip，使得最终 image 与原始编译的二进制文件保持一致。`INHIBIT_PACKAGE_DEBUG_SPLIT` 是阻止 bitbake 将 debug symbol 从二进制文件中分离出来。

上述这种方式，通过 SRC_URI 指定 prebuilt libraries，通过 `do_fetch` 获取文件后，可以直接执行 `do_install` 及其后续的任务，而 `do_configure` 和 `do_compile` 两个任务就不用执行了。

````
do_configure[noexec] = "1"
do_compile[noexec] = "1"
````

而 `do_install` 在安装时，是通过 FILES 变量指定需要安装的文件的。作为动态库，如果没有版本信息，可以直接指定，比如

````
FILES:${PN} = "${libdir}/libfoo.so"
````

如果含有版本信息，比如

````
libfoo.so
libfoo.so.1
libfoo.so.1.0
````

那在 recipe 中，需要将带版本号的库和不带版本号的库分成 `${PN}` 和 `${PN}-dev` 两个 package。

````
SOLIBS = ".so.*"
SOLIBSDEV = ".so"
FILES:${PN} += "${libdir}/lib*${SOLIBS}"
FILES_SOLIBSDEV ?= "${libdir}/lib*${SOLIBSDEV}"
FILES:${PN}-dev += "${FILES_SOLIBSDEV}"
````

不带版本号的库可理解为运行时库，而 dev 库，为开发库，还会包含头文件等信息，用于开发过程使用。

## prebuilt rootfs

在 「如何使用外部工具链」 中，分析了 glibc-external 中 libc 头文件和库的处理方式。

![glibc external](/images/columns/glibc-copy-from-rootfs.png)

bitbake 在 `do_install` 任务中，首先从 sysroot 中，找到 FILES 变量指定的文件，然后通过 `copy_from_sysroot` 函数将文件 copy 到 `${WORKDIR}/image` 中，完成对 prebuilt binaries 和头文件的安装工作，而 `do_fetch` 可以什么都不用做，`do_configure` 和 `do_compile` 两个任务也不用执行。

可以利用这个思路，在 bitbake 中使用一个外部的 prebuilt rootfs，使得已经编译好的二进制文件直接通过 `do_install` 任务进行安装，而不需要再次进行编译，缩短构建时间。

这种方式，需要解决这几个问题：

1. 组成 rootfs 的组件中，一个或者多个组件对应到一个 recipe(实际中，一个 recipe 构建出来的 rpm/deb 也是多个的)。需要记录清楚，每一个对应的 recipe 与之相对的组件中的所有文件在 rootfs 中的位置，后续需要这些信息在 rootfs 搜索到这些文件。
2. recipe 与 rootfs 中组件的映射关系，一个 recipe 可能对应多个。
3. 如何让组件对应的这些 recipe 直接使用 rootfs 中的文件。

### 构建 rootfs 的细节设计

为了方便起见，我们以 poky 来构建一个基础的 rootfs。使用 kirkstone 版本，构建 `core-image-minimal` 镜像，同时会生成一个 rootfs。

在构造 rootfs 的过程中，我们可以解决前面提到的第一个和第二个问题。新建一个 task，将 `do_install` 任务中安装的文件记录到一个文件中。文件命名方式为 `${PN}.list`，这样做的好处就是 PN 对应了 recipe ，这样，recipe 对应的组件中的文件也都记录下来了，前两个问题就解决了。

````
do_create_package_list() {
  cd ${D}
  mkdir -p ${PREBUILT_PKG_LIST_DIR}
  find . ! -type d -name "*" | sed 's/^\.//g' > ${PREBUILT_PKG_LIST_DIR}/${PN}.list
}
addtask do_create_package_list after do_install before do_populate_sysroot
````

创建了一个新的任务 `do_create_package_list`，任务执行在 `do_populate_sysroot` 之前，`do_install` 任务执行之后。

`PREBUILT_PKG_LIST_DIR` 变量，可以在 local.conf 中指定，保存 .list 文件。

运行上述任务，会同时为 target 和 native 都会生成 .list 文件，我们只需要 target 的版本即可，所以还需要屏蔽掉 native 的版本

````
do_create_package_list:class-native() {
  :
}
````

shell 中冒号表示空语句。

如果不想所有的 recipe 都执行该任务生成 .list 文件，可以使用变量的方式来控制。

````
do_create_package_list() {
  if [ -z "${NEED_CREATE_PACKAGE_LIST}" ]; then
    return
  fi

  bbnote "create package list file for ${PN}"
  cd ${D}
  mkdir -p ${PREBUILT_PKG_LIST_DIR}
  find . ! -type d -name "*" | sed 's/^\.//g' > ${PREBUILT_PKG_LIST_DIR}/${PN}.list
}
````

使用 `NEED_CREATE_PACKAGE_LIST` 变量来控制是否生成 .list 文件。将上述代码保存到 `classes/create_package_list.bbclass` 文件中，在 `conf/layers.conf` 中引用

````
INHERIT += "create_package_list"
````

在构建 `core-image-minimal` 时即可全局生效。同时，

````
require prebuilt_package_files.inc
````

在 `prebuilt_package_files.inc` 中定义为需要生成 .list 文件的 package 设置 `NEED_CREATE_PACKAGE_LIST` 变量

````
NEED_CREATE_PACKAGE_LIST:pn-acl = "1"
````

就可以控制指定的 recipe 在执行 `do_create_package_list` 任务时，是否生成 .list 文件了。

当 rootfs 生成时，同时也生成了 recipe 对应的 .list 文件，文件中保存的就是该 recipe 对应安装的文件列表信息。

### 使用 rootfs

利用 .list 文件，相当于获取到了 rootfs 组件对应的 recipe 的映射关系，同时还知道了组件在 rootfs 中的目录位置。

利用上述信息，在一个新的 yocto 构建系统中，首先需要为对应的 recipe 创建相应的 bbappend 文件。bbappend 中，就是读取对应的 .list 文件内容，将其设置到 FILES 变量中，然后通过 `do_install` 任务进行安装。

创建 `prebuilt_pkgs_install.bbclass` 定义通用的 `do_install` 任务，进行安装。

````
do_install:prepend:class-target() {
  installed_files="${PREBUILT_PKG_FILES}"
  if [ "${PREBUILT_PKG_LIST_FILES_PATH}" != "" ]; then
    list_file_path="${PREBUILT_PKG_LIST_FILES_PATH}"
  else
    list_file_path="${EXTERNAL_TOOLCHAIN_SYSROOT}/../prebuilt_package_list"
  fi

  for f in ${installed_files}; do
    list_fn="${list_file_path}/${f}.list"

    if [ ! -f "${list_fn}" ]; then
      continue
    fi
    
    bbnote "found list file: ${list_fn}"
    cat ${list_fn} | while read line; do
      # create linked file from sysroot
      if [ "${line}" = "" ]; then
        continue
      fi
      from="${EXTERNAL_TOOLCHAIN_SYSROOT}/${line}"
      if [ -d ${from} ]; then
        mkdir -p ${D}${line}
      elif [ -f ${from} ]; then
        mdir=$(dirname ${line})
        if [ ! -d ${D}/${mdir} ]; then 
          mkdir -p ${D}/${mdir}
        fi
        bbnote "creating symlink: ${D}${line}"
        ln -sf ${from} ${D}${line}
      fi
    done
  done

  # ignore the do_install_append recipe functions
  return
}
````

创建一个 `prebuilt_rootfs.inc` 配置文件，定义读取 .list 文件的 python 函数

````
# return all the contents of files in prebuilt_package_list directory
def get_prebuilt_package_file_contents(d):
  filepath = d.getVar('EXTERNAL_PREBUILT_PACKAGE_LIST')
  filecontents = ""
  prebuilt_pkg_files = d.getVar('PREBUILT_PKG_FILES')
  if prebuilt_pkg_files == '':
    return filecontents

  for f in prebuilt_pkg_files:
    fpath = os.path.join(filepath, f + ".list")
    filecontents += ' '.join(cn.rstrip() for cn in oe.utils.read_file(fpath).splitlines()) + " "

  return filecontents
````

在定义了读取接口和安装 install 的任务后，就可以通过脚本或者 task 的方式为 recipe 生成 bbappend 文件了。比如 acl 的 bbappend 文件

````
do_configure:prepend:class-target() {
  return
}
do_configure:class-target() {
  :
}
do_compile:prepend:class-target() {
  return
}
do_compile:class-target() {
  :
}
do_configure_ptest_base:class-target() {
  :
}
do_compile_ptest_base:class-target() {
  :
}

do_install:class-target() {
  :
}

do_install:ptest_base:class-target() {
  :
}
do_package[noexec] = "1"
do_packagedata[noexec] = "1"
do_package_write_rpm[noexec] = "1"
PREBUILT_PKG_FILES += "acl"

inherit prebuilt_pkgs_install
require prebuilt_rootfs.inc
````

`do_configure:prepend:class-target` 函数，是在 target 的 `do_configure` 之前执行的，也就是将这个代码片段插入到 `do_configure` 函数体前的位置。这样，执行的时候直接就 return 了，不会再执行后面的部分。

上述 bbappend 的作用，就是取消 `do_configure`，`do_compile`, `do_install` 这三个任务的作用，而 `do_install` 通过上面 `prebuilt_pkgs_install.bbclass` 中定义的 `do_install:prepend` 函数起作用，将 .list 中的文件从 rootfs 中 copy 到 `${WORKDIR}/image` 中。

注意，bbappend 中同样将打包的任务关掉了，这样只能用于构建特定的 recipe，如果需要构建 core-image 打包的任务是不能关闭的，不然最终 `do_rootfs` 任务就没办法安装 rpm package 了。

![prebuilt rootfs in yocto](/images/columns/prebuilt_rootfs_in_yocto.png)

使用上面这种方式，使得在 poky 中可以使用外部的 rootfs，其实就相当于将部分 recipe 的构建过程替换掉了，换成了 rootfs 中已经构建好的。而整个构建过程不变，依赖的模块仍然是基于 `do_populate_sysroot` 的方式传递当前模块的头文件和相关的库。

这种方式有一个好处，就是使用 kirkstone 版本构建的 rootfs，在其他构建系统中使用时，可以不关心版本兼容性问题。也就是说，在 kirkstone 版本构建的 rootfs，可以在 sumo, honister 等其他版本中使用。

这是因为，rootfs 使用过程是通过 bbappend 使用起来的的，是通过 `do_install` 任务从 rootfs 中将相关的文件 copy 到 `${WORKDIR}/image` 中的，这里的过程与具体的 poky 版本无关。但是需要注意

- bbappend 的定义以及伤处 `do_install` 和获取 .list 文件内容的定义，需要满足特定的 poky 版本的语法
- 注意 rootfs 组件与当前使用 rootfs 的构建系统中的 recipe 的正确的映射关系。不同版本中的映射关系会有细微差别，这就需要维护一个映射表了。

但是同时，这种做法也会引入一个问题。就是如果使用 rootfs 的构建系统的版本与原有构建 rootfs 的 poky 版本不同，也就是说，当前 recipe 中指定的 package 的版本与 rootfs 中预编译的库的版本是不同的，这就造成 host 和 target 是不同的版本。可能会出现如下问题

- 在某些依赖 python 库的源码构建中，存在从编译的 host 版本的 python 中推断 target 中的依赖库路径的做法，这时，就需要手动指定 target 中的 python 相关库的路径，否则就会存在库找不到的错误
- 在 glib 库，高版本的 glib 与低版本的 glib 工具在执行参数上存在差异，如果检测到 target 的版本是高版本，从而导致 poky 人文当前 host 版本也是高版本，在执行 glib 工具时，使用高版本的参数来执行，但是 host 版本其实是一个低版本的工具，就会出现参数不识别，运行错误的情况。这种情况，需要将 glib 的 recipe 进行升级，使得 host 和 target 的版本保持一致。

![build rootfs and use](/images/columns/build_rootfs_and_use.png)

## 内容小结

本章介绍了使用 prebuilt binaries 的方式。一种方式是通过 SRC_URI 的方式指定 prebuilt binaries 的源，通过 `do_fetch` 任务下载相应的文件供 bitbake 构建使用。

另一种方式借鉴了 `meta-external-toolchain` 中 glibc-external 的思路，在构建过程中，通过从外部 rootfs 中找到相关的文件，然后将文件 copy 到 `${WORKDIR}/image` 中，替换掉原有 recipe 的构建过程。

这种方式也是一种在 poky 中使用外部 rootfs 的方式，而且能够忽略掉 recipe 本身中所指定的 package 的版本，而直接使用外部 rootfs 中预编译好的版本的库，但是同样也会引入一些库找不到或者 host 跟 target 版本不一致的问题，这个时候要么通过手动指定 target 版本的库路径，要么通过升级 recipe 来解决。

## reference

1. [working with prebuilt libraries](https://docs.yoctoproject.org/dev-manual/prebuilt-libraries.html)
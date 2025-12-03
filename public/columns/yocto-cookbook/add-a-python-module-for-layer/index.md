大家好，我是吴震宇。

poky 中的 bitbake 是可以同时解析 shell 和 python 的，在 recipe 中，我们可以通过

````
python do_mytask() {
  ...
}
````

的方式定义一个 bitbake-style 的 python 函数，该函数可以作为 bitbake 的 task 使用。也可以通过

````
python __anonymous__() {
  ...
}
````

定义一个 python 匿名函数，该函数在 bitbake 解析完 recipe 后被执行。同时还可以通过

````
def foo():
    ...
````

python 标准语法定义一个 python 函数，该函数可以被上述两种方式调用。

以上这三种方式，都可以在 recipe 中定义一个 python 形式的函数，而在编写 python 函数的过程中，还会经常使用 import 语句，导入一个定义好的 python module。比如 `meta-external-toolchain` 中的

````
├── lib
│   └── oe
│       ├── external.py
│       ├── __init__.py
````

在 `do_install` 中就直接使用了 `oe.external`

![oe external](/images/columns/oe-external.png)

本章所要讨论的，就是如何在 layer 中添加一个 python module。

## yocto 中导入 python module 的原理

上面提到的 `meta-external-toolchain` 中的例子，能够直接使用 `oe.external.gather_pkg_files` 函数，是因为执行的 python 上下文中已经 import 了 `oe`，所以可以通过 `oe.external.gather_pkg_files` 方式直接调用，也可以使用

````
from oe.external import gather_pkg_files
````

而直接调用函数，不需要添加前缀了。

来分析一下 `meta-external-toolchain` 中导入 oe 的方式。

在 `conf/layer.conf` 中，

````
INHERIT:append = " external_global"
````

继承了 `external_global.bbclass`，该 bbclass 中定义了导入 python module 的方式

![oe external import python modules](/images/columns/oe-external-import-python-module.png)

在 `EXTERNAL_IMPORTED` 变量声明和定义时调用了 `fixed_oe_import(d, ['oe.external'])` 函数，此时，python 就将 `oe.external` 导入到了 bitbake 的 python 执行上下文中了。来分析一下

BBPATH 指定了当前构建系统中 layer 的路径，bitbake 将 BBPATH 目录下所有的 lib 子目录加入到了 `sys.path` 路径中

````
bbpath = d.getVar('BBPATH').split(":")
layerpaths = [os.path.join(dir, "lib") for dir in bbpath]
sys.path[0:0] = layerpaths
````

这样，当使用 import 导入某个 python 模块时，根据 python 的 import 机制，首先在 `sys.builtin_module_names` 内置列表中寻找，不存在就会在 `sys.path` 指定的路径中寻找，如果

````
import oe.external
````

在 `sys.path` 中刚好能够找到，因为 `meta-external-toolchain/lib/oe/external.py` 定义了该模块，python 就将该 python 模块导入到上下文环境中使用。

如果 modules 参数为空，就将 bitbake 内置的 `OE_IMPORTS` 模块加入，如果不为空，

````
imported = importlib.import_module(toimport)
````

通过 `importlib.import_module` 将模块逐个导入。

`OE_IMPORTS` 是 bitbake 中的内部变量，定义了 bitbake 默认导入的 python 模块，在 `base.bbclass` 中定义

````
OE_EXTRA_IMPORTS ?= ""

OE_IMPORTS += "os sys time oe.path oe.utils oe.types oe.package oe.packagegroup oe.sstatesig oe.lsb oe.cachedpath oe.license oe.qa oe.reproducible oe.rust oe.go ${OE_EXTRA_IMPORTS}"
OE_IMPORTS[type] = "list"

PACKAGECONFIG_CONFARGS ??= ""

def oe_import(d):
    import sys

    bbpath = [os.path.join(dir, "lib") for dir in d.getVar("BBPATH").split(":")]
    sys.path[0:0] = [dir for dir in bbpath if dir not in sys.path]

    import oe.data
    for toimport in oe.data.typed_value("OE_IMPORTS", d):
        try:
            # Make a python object accessible from the metadata
            bb.utils._context[toimport.split(".", 1)[0]] = __import__(toimport)
        except AttributeError as e:
            bb.error("Error importing OE modules: %s" % str(e))
    return ""

# We need the oe module name space early (before INHERITs get added)
OE_IMPORTED := "${@oe_import(d)}"
````

`oe_import` 函数中，循环遍历 BBPATH 路径，并将这些路径中的 lib 子目录加入到 `sys.path` 中，与上面的思路相同。同时将 `OE_IMPORTS` 变量指定的模块通过 `__import__` 导入，这是一个 python 内置函数，用于导入 python 模块。

`OE_IMPORTS` 预留了一个外部可使用的变量 `OE_EXTRA_IMPORTS`，可以用来指定额外的模块。

也就是说，如果需要在 layer 中新增一个可使用的 python 模块，可以有两种思路

1. 以默认的 lib 的形式，在 layer 目录中添加一个 lib 子目录，在该子目录中编写 python 模块
2. 不需要以 lib 子目录的形式，直接通过自定义 python 函数的形式指定导入的模块 (该方法未验证，童鞋们可以验证一下该方法是否可行，欢迎在评论区给出你的实现和回答)

## simple example

下载 poky

```shell
git clone -b kirkstone https://github.com/yoctoproject/poky.git
```

通过 source 命令设置 bitbake 环境

````
mkdir build && cd build
source ../oe-init-build-env .
````

创建一个新的 layer `meta-applications`，目录结构如下

````
conf
  - layer.conf
lib
  - oe
    test_lib.py
recipes-devtool
  - make-cross_4.2.1.bb
````

设置 `layer.conf` 配置文件，兼容 kirkstone 版本

````
BBPATH .= ":${LAYERDIR}"
BBFILES += "${LAYERDIR}/recipes-*/*.bb \
            ${LAYERDIR}/recipes-*/*.bbappend"

BBFILE_COLLECTIONS += "meta-application"
BBFILE_PATTERN_meta-application = "^${LAYERDIR}/"

LAYERSERIES_COMPAT_meta-application = "kirkstone"
````

将当前 layer 的路径加入到了 BBPATH 中，bitbake 可以通过 BBPATH 找到 `meta-applications` 这个 layer。

新增一个 recipe，用于编译构建 make 4.2.1。使用 externalsrc 的方式指定本地的 make 源代码，可以先将 make 4.2.1 的源代码下载下来

````
wget https://ftp.gnu.org/gnu/make/make-4.2.1.tar.bz2
````

编写 `make-cross_4.2.1.bb`，

````
LICENSE = "GPLv3 & Unknown"
LIC_FILES_CHKSUM = "file://COPYING;md5=d32239bcb673463ab874e80d47fae504 \
                    file://tests/COPYING;md5=d32239bcb673463ab874e80d47fae504 \
                    file://glob/COPYING.LIB;md5=4a770b67e6be0f60da244beb2de0fce4"

inherit externalsrc
MAKE_VERSION ?= "4.2.1"

# /path/to 为本地下载的 make 的源码路径
EXTERNALSRC:pn-make-cross = "/path/to/make-${MAKE_VERSION}"

inherit autotools cmake

DESCRIPTION = "gnu make 4.2.1 for yocto build"
SECTION = "gnu make"
DEPENDS = ""

do_configure() {
  if [ "${S}" != "${B}" ]; then
    rm -rf ${B}
    mkdir -p ${B}
    cd ${B}
  fi

  ${CC} --version

  ${S}/configure --host=x86_64-linux-gnu --target=${EXTERNAL_TARGET_SYS}
}

do_compile() {
  make VERBOSE=1
}

python do_install() {
  bb.build.exec_func('do_install_extra', d)

  from oe.test_lib import show_paths
  show_paths(d)
}

do_install_extra () {
  DESTDIR=${D} make install
}

FILES:${PN} += "\
    /usr/local/bin/make \
    /usr/local/share/* \
    /usr/local/include/* \
"
INSANE_SKIP:${PN} += "build-deps file-rdeps"
````

在 `make-cross_4.2.1.bb` 中，重写了 `do_install` 函数，`do_install` 为 bitbake-style 的 python 函数，因为此处我们需要引入一个 python module。

通过 `bb.build.exec_func` 函数来调用 `do_install_extra` 这个 shell 函数，也是实际 install 的函数。该接口也可以调用 python 函数。

install 结束后，导入了我们新添加的 `lib/oe/test_lib.py` 模块。`test_lib.py` 中仅实现了一个打印函数

```python
import bb

def show_paths(d):
  '''Show bbpath'''
  bbpath = d.getVar('BBPATH').split(":")
  if bbpath == '':
    bb.warn('BBPATH is empty')

  for p in bbpath:
    bb.note("bbpath contains: %s" % p)
  

  bb.note('__name__ = %s' % __name__)
```

使用 bitbake 编译看下日志

````
bitbake make-cross -v
````

`-v` 参数可以看到 bb.note 打印的信息，如果使用 `-vv` 或者 `-vvv` 能看到更加详细的 debug 日志信息。

````
NOTE: make-cross-4.2.1-r1 do_install: bbpath contains: /workspace/test/poky/meta-poky
NOTE: make-cross-4.2.1-r1 do_install: bbpath contains: /workspace/test/poky/build
NOTE: make-cross-4.2.1-r1 do_install: bbpath contains: /workspace/test/poky/meta
NOTE: make-cross-4.2.1-r1 do_install: bbpath contains: /workspace/test/poky/meta-yocto-bsp
NOTE: make-cross-4.2.1-r1 do_install: bbpath contains: /workspace/test/poky/meta-applications
NOTE: make-cross-4.2.1-r1 do_install: __name__ = oe.test_lib
````

说明新添加的 python module 已经导入成功。

**NOTE：python module 不能再 python 匿名函数中使用。**

python module 通常是在 bitbake-style 的 python 函数中使用的，这些函数是在 task 运行过程中被执行的，也就是说，执行 task 时，bitbake 准备好的 python 的运行时环境才将这些 python module 导入进来了，所以可以使用。

但是 python 匿名函数是在 bitbake 解析完 recipe 后执行的，这个时候并没有 task 在执行，添加的 python module 也没有导入，所以不能使用。

## 内容小结

本章讨论了如何在 layer 中添加一个新的 python module。bitbake 在 base.bbclass 中定义了 `oe_import` 函数，可以将 layer 中的 python module 导入到 bitbake 的 python 执行环境中，而这些导入的模块通过内部变量 `OE_IMPORTS` 指定。

如果我们需要在 layer 中添加一个新的 python module，可以在 layer 添加一个 lib 子目录，在该目录中添加 python 模块实现，而 bitbake 会默认将 lib 模块导入，在 bitbake-style 的 python 函数中可以直接使用。

但是在 python 匿名函数中不要使用，因为此时 python 执行环境还没有导入这些 python 模块，此时才刚刚解析完 recipe，还没有执行 task。
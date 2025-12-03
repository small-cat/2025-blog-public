hello，大家好，我是吴震宇。

当我们使用 bitbake 进行编译构建时，在 poky 中，bitbake 首先需要做的事情就是构建出一个交叉编译工具链 gcc，用来进行编译的工作。

而 bitbake 构建 gcc 编译器的过程，被分成了好几个步骤。我们以 kirkstone 版本的 poky 为例，来分析一下 bitbake 构建 gcc 编译器的过程。
- `gcc-cross_11.4.bb` 这个 recipe 用来构建 gcc 编译器，也就是 cc1、cc1plus，以及 gcc 和 g++ 这些 driver 程序。同时该 recipe 还会依赖 binutils 配方，也就是说，gcc-cross 编译构建的同时，必须保证 binutils 也构建完成。可以看下最终的结果
```
# ls image/usr/bin
aarch64-poky-linux-cpp  aarch64-poky-linux-gcc-ar      aarch64-poky-linux-gcov       aarch64-poky-linux-lto-dump  cpp  gcov
aarch64-poky-linux-g++  aarch64-poky-linux-gcc-nm      aarch64-poky-linux-gcov-dump  c++                          g++  gcov-tool
aarch64-poky-linux-gcc  aarch64-poky-linux-gcc-ranlib  aarch64-poky-linux-gcov-tool  cc                           gcc
```

- `gcc-runtime_11.4.bb` 用于构建 gcc 的运行时库，也就是 gcc 编译器运行时所依赖的一些库，比如 libstdc++.so, libssp.so，libatomic.so 等。

- `libgcc_11.4.bb` 用于构建 `libgcc_s.so` 库，该库在使用 gcc 编译器编译时，最终会被链接到目标程序中，可以通过 `-v` 参数观察整个链接过程。

- `gcc-sanitizers_11.4.bb` 用于构建 gcc 的 sanitizer 库，当使用 gcc 的 sanitizer 特性比如内存检查，就会使用到这些库。

- `libgfortran_11.4.bb` 用于构建 gfortran 编译器及其相关的库。

这就是整个 gcc 编译器在 poky 中构建的方式，通过不同 recipe 的方式分成了多个部分。在前面我们讨论外部工具链时，也提到了外部工具链配方的实现方式，也就是通过设置 recipe 的优先级的方式来通知 poky 使用那个 recipe 来构建工具链。
```
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}gcc ?= "gcc-external-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_virtual/${TARGET_PREFIX}g++ ?= "gcc-external-cross-${TARGET_ARCH}"
PREFERRED_PROVIDER_gcc-runtime = "gcc-runtime-external"
PREFERRED_PROVIDER_gcc-sanitizers ?= "gcc-sanitizers-external"
PREFERRED_PROVIDER_libgfortran = "libgfortran-external"
```
通过 `PREFERRED_PROVIDER_XXX` 变量的方式来提升某个 target 关联的 recipe 的优先级，使得 poky 在构建 gcc 编译器时，优先使用该变量指定的 recipe 来构建工具链。这样，poky 原生的 gcc 11.4 的 recipe 就被替换成了外部工具链 layer 中实现的 recipe 了，而 gcc 不会再使用源码的方式进行构建，而是使用外部已经准备好的编译器。

无论是原生 poky 构建的 gcc 11.4 交叉工具链，还是使用外部工具链，poky 在使用编译器进行编译时，是如何调用这些工具链的呢？

## poky 使用工具链的方式
当 bitbake 通过源代码的方式构建 gcc-cross 交叉编译工具链时，因为 gcc cross 交叉编译工具链本身是 host 机器上运行的，所以在 `tmp/work/x86_64-linux` 中会构建 `gcc-cross-aarch64` 工具链。当需要使用工具链进行编译时，比如编译 `attr_2.5.1.bb`，bitbake 首先需要做的就是为 attr 准备编译环境。

bitbake 通过 `attr_2.5.1.bb` 中指定的 DEPENDS 信息，使用 `do_prepare_recipe_sysroot` 这个 task，将依赖的 package 对应的相关文件安装到 attr 编译目录中的 `recipe-sysroot` 和 `recipe-sysroot-native` 文件夹中。
- `recipe-sysroot` 中是 attr 依赖的目标文件，也就是交叉编译所需的相关的头文件以及库
- `recipe-sysroot-native` 中是 attr 依赖的 host 机器上的头文件以及库，以及需要执行的 host 的程序。

前面构建好的 gcc 11.4 交叉编译工具链就是安装到了 `recipe-sysroot-native` 中。

注意，这里提到的**安装**，也是 bitbake 中的 task 的概念。在 recipe 中默认的**安装** task 就是 `do_install`。也就是说，bitbake 在为 attr 准备交叉编译工具链时，调用 `do_prepare_recipe_sysroot` 这个 task，此时安装 gcc-cross 的动作，与 `gcc-cross_11.4.bb` 中定义的 `do_install` 这个 task 一致。不过 bitbake 不是直接调用的 `do_install`，而是 gcc-cross 在构建时，会通过 `do_populate_sysroot` 这个 task，将对应需要安装的文件都安装到 `destdir-sysroot` 文件夹中，而 `do_prepare_recipe_sysroot` 这个 task 只是将 gcc-cross 构建目录中的 `destdir-sysroot` 文件夹中的文件安装到 attr 构建目录中的 `recipe-sysroot-native` 文件夹中。

外部工具链中的使用方式也是如此，只不过外部工具链中的 gcc/g++ 这些程序，是通过 wrap 的方式封装起来的。

![external gcc wrapper](/images/columns/external_gcc_wrap.png)

wrap_bin 函数封装的 gcc，其实是一个 shell 脚本，调用的是外部工具链中的 gcc，可以看下 `recipe-sysroot-native/usr/bin/aarch64-poky-linux` 中的 gcc 脚本
```
$ cat aarch64-linux-gnu-gcc
#!/bin/sh
exec /workspace/toolchain/gcc-cross/bin/aarch64-linux-gnu-gcc "$@"
```

当外部工具链 recipe 中的 `do_install` 执行结束后，上述这些封装后生成的脚本就被安装到了 `${WORKDIR}/image` 中，同时通过 `do_populate_sysroot` 任务，会将 image 中需要安装的文件安装到 `destdir-sysroot` 文件夹中。当其他模块依赖该模块时，也就是需要工具链进行编译时，就会调用 `do_prepare_recipe_sysroot` 这个 task，将依赖的模块的 `destdir-sysroot` 文件夹中的文件，安装到当前模块构建目录中的 `recipe-sysroot-native` 文件夹中。

![usage of toolchain](/images/columns/usage_toolchain_in_poky.png)

所以，外部工具链使用后，在模块的 `recipe-sysroot-native` 中看到的是上述封装的 shell 脚本。

bitbake 通过 recipe 中指定的 DEPENDS 信息， 为模块准备编译环境，包括所使用的工具链环境，以及依赖的 host 工具，和依赖的 target 的库。不同模块编写的 recipe 不同，DEPENDS 依赖也不同，也就是说，每一个模块编译的环境都是不同的，编译所使用的 host 工具不同，编译对应的 `recipe-sysroot` 根文件系统也是不同的。

bitbake 为每一个模块都构建了一个独立的编译环境，且是相互隔离的。每一个模块都有自己的编译工具链和根文件系统 `recipe-sysroot` 以及所依赖的 host 环境 `recipe-sysroot-native`。

正是因为这种相互隔离的编译环境，使得在同一个 package 下可以设置不同的工具链，同时也可以在不同的 package 下，设置不同版本的 gcc 工具链，且互相不影响。

![multi toolchains](/images/columns/multi-toolchains.png)

## 支持 layer 中多工具链的实现方式
yocto 中使用工具链时，是 bitbake 通过 `do_prepare_sysroot` 这个 task 将工具链从其构建目录中安装到当前模块的 `recipe-sysroot-native` 文件夹中的。当 bitbake 调用工具链对当前模块进行编译时，通过 `do_compile` 任务进行。而 bitbake 会为该任务生成一个 `run.do_compile` 的 shell 脚本来执行该任务。

在 `run.do_compile` 中，首先会设置 PATH 环境变量。
```
export PATH="/workspace/build/tmp/sysroots-uninative/x86_64-linux/usr/bin:/workspace/poky/scripts:/workspace/build/tmp/work/cortexa57-poky-linux/attr/2.5.1-r0/recipe-sysroot-native/usr/bin/aarch64-poky-linux:/workspace/build/tmp/work/cortexa57-poky-linux/attr/2.5.1-r0/recipe-sysroot/usr/bin/crossscripts:/workspace/build/tmp/work/cortexa57-poky-linux/attr/2.5.1-r0/recipe-sysroot-native/usr/sbin:/workspace/build/tmp/work/cortexa57-poky-linux/attr/2.5.1-r0/recipe-sysroot-native/usr/bin:/workspace/build/tmp/work/cortexa57-poky-linux/attr/2.5.1-r0/recipe-sysroot-native/sbin:/workspace/build/tmp/work/cortexa57-poky-linux/attr/2.5.1-r0/recipe-sysroot-native/bin:/workspace/poky/bitbake/bin:/workspace/build/tmp/hosttools"
```
这是在编译 attr 的时候，PATH 环境变量的设置。可以发现，bitbake 在脚本中设置的 PATH 环境变量的路径，都是 poky 本身的路径，以及 `recipe-sysroot-native` 中的路径。而执行环境本身的环境变量并没有继承过来，这是因为 bitbake 在初始化时就对环境变量做了一次 clean 的操作，这样能够保证整个环境都是 bitbake 设置的内部环境，不会收到 host 主机环境或者其他模块编译环境的干扰。

CC 和 CXX 就是设置编译器的两个环境变量
```
export CC="aarch64-linux-gnu-gcc  -mcpu=cortex-a57 -march=armv8-a+crc -mbranch-protection=standard -fstack-protector-strong  -O2 -D_FORTIFY_SOURCE=2 -Wformat -Wformat-security -Werror=format-security --no-sysroot-suffix --sysroot=/workspace/build/tmp/work/cortexa57-poky-linux/attr/2.5.1-r0/recipe-sysroot"

export CXX="aarch64-linux-gnu-g++  -mcpu=cortex-a57 -march=armv8-a+crc -mbranch-protection=standard -fstack-protector-strong  -O2 -D_FORTIFY_SOURCE=2 -Wformat -Wformat-security -Werror=format-security --no-sysroot-suffix --sysroot=/workspace/build/tmp/work/cortexa57-poky-linux/attr/2.5.1-r0/recipe-sysroot"
```
因为工具链安装到了 `recipe-sysroot-native` 中，而且 PATH 环境变量也设置了，此处的 CC 和 CXX 就能直接运行，而 `--sysroot` 选项设置的就是编译的根文件系统。

当 bitbake 执行 `run.do_compile` 脚本进行编译时，就会通过 CC 和 CXX 的设置，调用编译器进行编译。

### yocto 中工具链的设置
在 `bitbake.conf` 中对编译器进行了基本的默认配置，
```
TOOLCHAIN_OPTIONS = " --sysroot=${STAGING_DIR_TARGET}"

export CC = "${CCACHE}${HOST_PREFIX}gcc ${HOST_CC_ARCH}${TOOLCHAIN_OPTIONS}"
export CXX = "${CCACHE}${HOST_PREFIX}g++ ${HOST_CC_ARCH}${TOOLCHAIN_OPTIONS}"
export FC = "${CCACHE}${HOST_PREFIX}gfortran ${HOST_CC_ARCH}${TOOLCHAIN_OPTIONS}"
export CPP = "${HOST_PREFIX}gcc -E${TOOLCHAIN_OPTIONS} ${HOST_CC_ARCH}"
export LD = "${HOST_PREFIX}ld${TOOLCHAIN_OPTIONS} ${HOST_LD_ARCH}"
export CCLD = "${CC}"
export AR = "${HOST_PREFIX}gcc-ar"
export AS = "${HOST_PREFIX}as ${HOST_AS_ARCH}"
export RANLIB = "${HOST_PREFIX}gcc-ranlib"
export STRIP = "${HOST_PREFIX}strip"
export OBJCOPY = "${HOST_PREFIX}objcopy"
export OBJDUMP = "${HOST_PREFIX}objdump"
export STRINGS = "${HOST_PREFIX}strings"
export NM = "${HOST_PREFIX}gcc-nm"
export READELF = "${HOST_PREFIX}readelf"

PATH:prepend = "${COREBASE}/scripts:${STAGING_BINDIR_TOOLCHAIN}:${STAGING_BINDIR_CROSS}:${STAGING_DIR_NATIVE}${sbindir_native}:${STAGING_BINDIR_NATIVE}:${STAGING_DIR_NATIVE}${base_sbindir_native}:${STAGING_DIR_NATIVE}${base_bindir_native}:"
export PATH
```
设置了 binutils 以及默认编译器。当 bitbake 生成 `run.do_compile` 脚本时，在脚本中设置的环境变量就是依赖于这些变量的值。

也就是说，如果能够按照条件修改这些变量对应的值，就相当于能够按照需要，为不同的 package 编译调用不同的编译器了。

### 支持不同工具链
了解了工具链构建的原理，以及 poky 中设置工具链的方式，我们就可以通过 bitbake 中的 OVERRIDE 机制来定制化对不同工具链的支持。

下面通过一个具体的例子来说明如何添加对一个特定版本的工具链的支持。添加一个 recipe 文件 `gcc-cross_11.4.bb`，用来构建 gcc 11.4，此处不使用源代码的方式进行构建，而是通过指定外部工具链的方式，这样更加灵活，而且能够缩短构建时间(gcc 编译器的编译时间还是挺久的)。
```
SRC_URI = "file://SUPPORTED"

PN = "gcc-cross-11.4-${TARGET_ARCH}"
DEPENDS += "virtual/${TARGET_PREFIX}binutils virtual/libc"

# check GCC_11.4_EXTERNAL_TOOLCHAIN
python () {
  gcc_toolchain_path = d.getVar('GCC_11.4_EXTERNAL_TOOLCHAIN')
  if gcc_toolchain_path == "":
    bb.error('GCC_11.4_EXTERNAL_TOOLCHAIN is not set')
}
```
`SRC_URI` 变量指定了一个名为 SUPPORTED 的文件，这是因为 bitbake 解析 recipe 时，`SRC_URI` 变量的值不能为空，这里就给了一个空的 SUPPORTED 文件作为该变量的值。

PN 的值默认为 `gcc-cross`，根据 recipe 文件名来的，这里额外添加了后缀，使得 package name 的名称更加完整。

而匿名 python 函数在 bitbake 解析完 recipe 后就会执行，主要是为了检查 `GCC_11.4_EXTERNAL_TOOLCHAIN` 是否设置，如果没有设置，则报错。该变量设置的就是外部工具链 gcc 11.4 的根目录，通过该目录找到 gcc 11.4 编译器。设置方式很简单，在 `local.conf` 设置即可。

我们在前文分析中提到了 bitbake 是如何准备 package 编译时的构建环境的，在工具链构建时，一个很重要的 task 就是 `do_install`。
```
do_configure[noexec] = "1"
do_compile[noexec] = "1"

do_install() {
  install -d ${D}${bindir}
  for bin in gcc g++ addr2line ar as c++ c++filt cpp elfedit gcov ld nm objcopy objdump ranlib readelf size strings strip ; do
    script="${D}/${bindir}/${TARGET_PREFIX}${bin}-${PV}"
    printf '#!/bin/sh\n' >${script}
    echo 'export LD_LIBRARY_PATH=${LD_LIBRARY_PATH}:${GCC_11.4_EXTERNAL_TOOLCHAIN}/lib/x86_64-linux-gnu' >> ${script}
    printf 'exec ${GCC_11.4_EXTERNAL_TOOLCHAIN}/bin/%s%s "$@"\n' "${TARGET_PREFIX}" "${bin}" >>${script}
    chmod +x ${script}
  done
}
```
bitbake 中，noexec 这个 flag 可以告诉 bitbake 不执行这个 task。因为使用的是外部工具链，都是预先编译好的二进制文件，所以不需要执行 configure 和 compile 这两个 task。

而 `do_install` 借鉴了 `meta-external-toolchain` 中的思路，通过 wrapper 的方式将编译器的调用封装起来，生成一个 shell 脚本的方式调用外部工具链。

这里有一个小技巧，就是设置 `LD_LIBRARY_PATH` 这个变量。
```
export LD_LIBRARY_PATH=${LD_LIBRARY_PATH}:${GCC_11.4_EXTERNAL_TOOLCHAIN}/lib/x86_64-linux-gnu
```
在 bitbake 的 recipe 或者 conf 文件中，是不能按照上述的方式进行设置的，因为
```
LD_LIBRARY_PATH=${LD_LIBRARY_PATH}
```
会被 bitbake 认为是自己递归自己，在 bitbake 中这种赋值方式是不被允许的。同时 bitbake 在初始化时，会 clean 环境变量，而根据需要自己来设置环境变量的值。这就使得当前运行环境中设置的环境变量是不能传递到 bitbake 中的(bitbake 提供了 `BB_ENV_EXTRAWHITE` 和 `BB_PRESERVE_ENV` 能部分解决这个问题，但是这些保留下来的环境变量是保存到 python 环境中的，可能不能继承到 shell 环境中)。

如果外部工具链中的 binutils 是按照 `--enable-shared` 的方式构建的，那么运行时需要依赖动态库，此时就需要设置 `LD_LIBRARY_PATH` 这个环境变量。所以在 wrapper 后封装的脚本中直接设置这个环境变量，就不会受到 bitbake 的约束了。

gcc 11.4 配方，会将外部工具链 gcc 11.4 wrapper 后安装到 `${WORKDIR}/image` 中，同时 `do_populate_sysroot` 任务会将 image 中的文件安装到 `destdir-sysroot` 中，以提供给其他依赖的模块使用。

同时，要想 package 在编译时能够使用 gcc 11.4 还需要设置工具链相关的配置。建立 `gcc-cross-11.4.bbclass`，通过 OVERRIDE 的方式重写 `bitbake.conf` 中设置的工具链相关的变量的值。
```
CC:toolchain-gcc-11.4  = "${TARGET_PREFIX}gcc-11.4 ${TOOLCHAIN_OPTIONS}"
CXX:toolchain-gcc-11.4 = "${TARGET_PREFIX}g++-11.4 ${TOOLCHAIN_OPTIONS}"
CPP:toolchain-gcc-11.4 = "${TARGET_PREFIX}gcc-11.4 ${TOOLCHAIN_OPTIONS} -E"
CCLD:toolchain-gcc-11.4 = "${TARGET_PREFIX}g++-11.4 ${TOOLCHAIN_OPTIONS}"
LD:toolchain-gcc-11.4 = "${TARGET_PREFIX}ld-11.4 ${TOOLCHAIN_OPTIONS}"
AR:toolchain-gcc-11.4 = "${TARGET_PREFIX}ar-11.4"
AS:toolchain-gcc-11.4 = "${TARGET_PREFIX}as-11.4"
RANLIB:toolchain-gcc-11.4 = "${TARGET_PREFIX}ranlib-11.4"
STRIP:toolchain-gcc-11.4 = "${TARGET_PREFIX}strip-11.4"
OBJCOPY:toolchain-gcc-11.4 = "${TARGET_PREFIX}objcopy-11.4"
OBJDUMP:toolchain-gcc-11.4 = "${TARGET_PREFIX}objdump-11.4"
STRINGS:toolchain-gcc-11.4 = "${TARGET_PREFIX}strings-11.4"
NM:toolchain-gcc-11.4 = "${TARGET_PREFIX}nm-11.4"
READELF:toolchain-gcc-11.4 = "${TARGET_PREFIX}readelf-11.4"
```
设置的值，就是上述在 `do_install` 中通过 wrapper 的方式生成的脚本名称。这样，在调用 `${TARGET_PREFIX}gcc-11.4` 时，实际执行的是一个 shell 脚本，而脚本中才是对外部工具链的调用。

`CC:toolchain-gcc-11.4` 这种形式，表示只有当 OVERRIDES 变量包含 `toolchain-gcc-11.4` 时，CC 的值才会被重新设置，这也是 bitbake 中的条件设置的方式之一。
```
OVERRIDES =. "${@['', 'toolchain-${TOOLCHAIN}:']['${TOOLCHAIN}' != '']}"
```
这句话表示，如果 TOOLCHAIN 变量的值为空，OVERRIDES 变量追加一个空值，如果不为空，比如是 gcc-11.4，那么 OVERRIDES 变量追加一个 toolchain-gcc-11.4 的值。

在 layer 的 `conf/layer.conf` 中添加对该 bbclass 的引用
```
INHERIT += "gcc-cross-11.4"
```
此时，通过设置 TOOLCHAIN 变量，就可以指定在编译器使用 gcc 11.4 工具链了。
```
TOOLCHAIN:pn-attr = "gcc-11.4"
```
在 package name 为 attr 的模块中，设置 TOOLCHAIN 为 gcc-11.4，上述 OVERRIDES 变量就会追加 toolchain-gcc-11.4，从而使得 poky 中对工具链的配置被重写，attr 构建目录中的编译器被设置成了 gcc 11.4，而不是默认的 gcc 交叉编译工具链了。

TOOLCHAIN 变量也可以在 package 对应的 recipe 中单独设置，比如在 attr 的 recipe 中
```
TOOLCHAIN = "gcc-11.4"
```
这种方式也可以指定 attr 使用 gcc 11.4 编译器进行编译。

使用上述同样的方式，可以设置 rustc，clang 以及其他版本的 gcc 工具链。同时也可以通过一个额外的 `multi-compiler.conf` 配置文件来为不同 package 设置 TOOLCHAIN 变量，以满足不同 package 使用不同编译器的需求。

这就达到了多工具链支持的效果。

## 内容小结
本章讨论了 poky 中通过 recipe 构建工具链的过程，以及 bitbake 在准备编译环境时使用工具链的方式。同时从 bitbake 配置默认工具链的角度出发，在掌握原理的情况下，讨论了如何实现对其他工具链的支持。

recipe 中的 `do_install` 任务，将外部工具链 wrapper 成一个 shell 脚本，安装到了 image，其他模块在编译时，通过 TOOLCHAIN 变量指定的工具链，以及重写后的 CC 和 CXX 变量指定的编译器，来调用对应的编译器进行编译。这样使得不同 package 的构建环境中可以同时存在多个不同的编译器，调用指定的编译器进行编译。
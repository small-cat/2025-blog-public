hello, 大家好，我是吴震宇。

yocto 作为一个构建系统，能够兼容很多构建工具，比如 cmake，autoconf，meson 等，而 yocto 为了能够灵活的适配这些不同的构建工具，通过 bbclass 或者 recipe 的方式，封装了对这些构建工具的接口，使得在 recipe 中需要使用这些构建工具时，仅仅通过几个简单的配置就能实现复杂的交叉编译过程。

本篇文章，我们就来分析一下 yocto 是如何实现 cmake 和 autoconf 的接口的。

## yocto interface for cmake

在 recipe 中要想能够使用 cmake 工具，前提是 recipe 对应的 source code 中已经支持了 cmake 构建，yocto 通过调用 cmake，根据 CMakeLists.txt 就能对 source code 进行编译。

yocto 在 `meta/classes/cmake.bbclass` 中实现了对 cmake 的接口。

````
DEPENDS:prepend = "cmake-native "
````

表示需要调用本机 host 的 cmake 工具。cmake-native 表明 yocto 将会自己编译一个 cmake 工具，并将其安装到 `${RECIPE_SYSROOT_NATIVE}` 中，这样通过将 `${RECIPE_SYSROOT_NATIVE}` 加入到 `PATH` 环境变量中，就可以使用该 cmake 工具了。

在 cmake.bbclass 中，默认将 cmake generator 设置为 Ninja。python 匿名函数在 recipe 被解析完后就会执行，判断 `OECMAKE_GENERATOR` 的值是否是 Unix Makefiles 或者 Ninja，其他 generator 在 yocto 中暂时不支持。

编译器可以通过

````
OECMAKE_C_COMPILER
OECMAKE_CXX_COMPILER
````

这两个变量来指定。编译参数可以通过

````
OECMAKE_C_FLAGS
OECMAKE_CXX_FLAGS
OECMAKE_C_FLAGS_RELEASE
OECMAKE_CXX_FLAGS_RELEASE
OECMAKE_C_LINK_FLAGS
OECMAKE_CXX_LINK_FLAGS
````

这些变量在 recipe 中设置。

深入 cmake.bbclass 可以发现，yocto 使用 cmake 进行交叉编译时，通过 `cmake_do_generate_toolchain_file()` 这个 shell 函数生成了一个 `${WORKDIR}/toolchain.cmake` 的文件。该文件在使用 cmake 时通过 `-DCMAKE_TOOLCHAIN_FILE` 参数来指定。

> This variable is specified on the command line when cross-compiling with CMake. It is the path to a file which is read early in the CMake run and which specifies locations for compilers and toolchain utilities, and other target platform and compiler related information.

这是 [cmake documentation](https://devdocs.io/cmake~3.26/variable/cmake_toolchain_file) 中对该变量的解释。也就是说 cmake 通过该文件来指定交叉编译工具链及其 sysroot 环境。该文件是在 cmake run 之前就解析的，cmake 执行过程中就会使用到该文件中设置的变量和环境。

该 shell 函数作为一个新增的 task 添加到了构建流程中。

````
addtask generate_toolchain_file after do_patch before do_configure
````

而在 `do_configure` 中就会使用到 cmake 生成 Makefile 等配置文件，所以在 `do_configure` 之前，需要先调用 `generate_toolchain_file` 这个 task 来生成 toolchain.cmake 文件。

![oecmake configure](/images/columns/oecmake_configure.png)

这些都是 yocto 中默认的设置。而所有这些变量的设置，都可以在 recipe 中通过 OVERRIDE 的方式来修改。最长使用的就是 `EXTRA_OECMAKE` 变量，添加额外的 cmake 参数。

在 cmake.bbclass 中使用了一种灵活的 class function 的形式。

````
cmake_runcmake_build() {
	bbnote ${DESTDIR:+DESTDIR=${DESTDIR} }${CMAKE_VERBOSE} cmake --build '${B}' "$@" -- ${EXTRA_OECMAKE_BUILD}
	eval ${DESTDIR:+DESTDIR=${DESTDIR} }${CMAKE_VERBOSE} cmake --build '${B}' "$@" -- ${EXTRA_OECMAKE_BUILD}
}

cmake_do_compile()  {
	cmake_runcmake_build --target ${OECMAKE_TARGET_COMPILE}
}

cmake_do_install() {
	DESTDIR='${D}' cmake_runcmake_build --target ${OECMAKE_TARGET_INSTALL}
}

EXPORT_FUNCTIONS do_configure do_compile do_install do_generate_toolchain_file
````

定义了 `cmake_do_compile()` 函数，同时使用 `EXPORT_FUNCTIONS` 导出了 `do_compile`。这是在 bbclass 中通过 inherit 继承方式实现 function 的一种方式。

定义函数，通过

````
classname_functionname
````

的形式，而实际 `EXPORT_FUNCTIONS functionname`。这样 recipe 在继承该 bbclass 的时候，就可以直接使用该 `functionname` 函数，而实际定义是 `classname_functionname`。

这样的好处是，当在 recipe 中需要重写 `functionname` 函数的时候，只需要在 recipe 中定义 `functionname` 函数接口，而如果需要调用 bbclass 中的 `functionname` 函数，需要使用 `classname_functionname`

````
functionname() {
  if [ some_condition ]; then
    classname_functionname "$@"
  else
    # do something else
  fi
}
````

就像上面的 `cmake_do_compile()` 函数，当其他 recipe 继承 cmake.bbclass 时，默认的 `do_compile` 函数已经在 bbclass 中实现了，直接调用 `cmake_do_compile()` 函数。

这样，当需要新增 recipe 调用 cmake 进行构建时，通过 `EXTRA_OECMAKE` 添加额外的 cmake 参数就可以了，非常方便。

````
inherit cmake
EXTRA_OECMAKE += "..."
````

## yocto interface for autoconf

yocto 实现了 `meta/classes/autotools.bbclass` 作为 autoconf 的接口。使用时，直接在 recipe 中继承该 bbclass 即可。

````
inherit autotools
````

当然，能够使用 autoconf 进行构建的源码项目，前提是已经准备好了 autoconf 相关的配置文件，比如 configure.ac。

在 `autotools_do_configure` 中就会提前检查这些配置文件。

````
for ac in `find ${S} -ignore_readdir_race -name configure.in -o -name configure.ac`; do
	rm -f `dirname $ac`/configure
done
````

yocto 会删除原先的 configure 脚本，然后利用配置文件，使用 autoreconf 重新生成 configure 脚本。

````
ACLOCAL="$ACLOCAL" autoreconf -Wcross -Wno-obsolete --verbose --install --force ${EXTRA_AUTORECONF} $acpaths || die "autoreconf execution failed."
````

这里需要注意的是 autotools 工具的版本，如果源代码中使用的 autotools 版本过低，而当前 yocto 中的 autotools-native 版本太高，可能会出现配置不兼容的问题，导致上述命令出错。这个时候就只能修改配置，或者降低 yocto 中的 autotools 版本了。还有一种方式，就是保留源代码中的 configure 脚本，不要让 yocto 重新生成，也就是重写 `do_configure` 函数，直接执行 configure 脚本生成 Makefile 文件。

当 configure 文件生成后，最后一步就是执行脚本，生成 Makfile 文件。

````
if [ -e ${CONFIGURE_SCRIPT} ]; then
	oe_runconf
else
	bbnote "nothing to configure"
fi
````

`oe_runconf` 是 autotools.bbclass 中封装的函数，调用 `configure` 脚本生成 Makefile 文件。

![oe_runconf](/images/columns/oerun_conf.png)

在 autotools.bbclass 中默认设置了很多 configure 的参数，用户在自己的 recipe 中可以通过 `EXTRA_OECONF` 变量添加额外的参数。

与 cmake.bbclass 相同，在 autotools.bbclass 中也是使用了继承机制的函数定义的方式，

````
EXPORT_FUNCTIONS do_configure do_compile do_install
````

导出了这三个通用的 task 的函数，供外部 recipe 使用。

大家在阅读 autotools.bbclass 的时候还会发现下面这种代码

````
do_configure[prefuncs] += "autotools_preconfigure autotools_aclocals ${EXTRACONFFUNCS}"
do_compile[prefuncs] += "autotools_aclocals"
do_install[prefuncs] += "autotools_aclocals"
do_configure[postfuncs] += "autotools_postconfigure"
````

task 的 flag 中设置了 prefuncs 和 postfuncs，表示在执行 task 之前和之后，需要执行的函数。在 `lib/bb/build.py:_exec_task(fn, task, d, quieterr)` 函数中可以看到

````
    prefuncs = localdata.getVarFlag(task, 'prefuncs', expand=True)
    postfuncs = localdata.getVarFlag(task, 'postfuncs', expand=True)
    ...

    for func in (prefuncs or '').split():
      exec_func(func, localdata)
    exec_func(task, localdata)
    for func in (postfuncs or '').split():
      exec_func(func, localdata)
    ...
````

上面只截取了部分代码片段。在执行 task 时，首先获取 task 的 prefuncs 和 postfuncs，然后执行 prefuncs，再执行 task，最后执行 postfuncs。

如果在 recipe 中，需要在 task 之前或者之后执行一些简单的操作，可以通过 OVERRIDE 机制中的 prepend 或者 append 的方式来实现。如果有一些复杂的操作，可以通过上述的方式，以 prefuncs 和 postfuncs 的形式来实现。

### CACHED_CONFIGUREVARS 变量的作用

在 `oe_runconf` 中，执行 configure 脚本时

````
CONFIG_SHELL=${CONFIG_SHELL-/bin/bash} ${CACHED_CONFIGUREVARS} $cfgscript ${CONFIGUREOPTS} ${EXTRA_OECONF} "$@"
````

`CACHED_CONFIGUREVARS` 变量作为执行 configure 脚本时设置环境变量。

在执行 configure 脚本时，会自动检查很多配置，如果是交叉编译，configure 会检查 sysroot 中可能会使用到的一些工具或者依赖的库以及头文件是否存在。同时，还会检查所使用的工具链是否支持某些特性，比如 python3.10 的 configure 脚本就会检查 gcc 工具链是否支持 `implicit-function-declaration` 特性。

这是 configure 默认自动检查的。而不同版本的工具链对 warning 的处理方式可能不同，如果 configure 中默认设置了 -Werror 选项，那么工具链在编译过程中，触发到 `implicit-function-declaration` 特性的 warning 时，configure 脚本就会报错。

当然为了抑制该错误，可以在 CFLAGS 中添加

````
CFLAGS += "-Wno-error=implicit-function-declaration"
````

但是这里也存在一个参数先后顺序的问题。如果上面通过 CFLAGS 的方式，是在 `-Werror` 选项之前，那么抑制该 warning 的选项就会被后面的 `-Werror` 覆盖，仍然会导致上述错误，将 warning 当做 error 来处理。

configure 中检查出来的结果都会保存到 config.log 中，作为一个 cache 变量。也就是说，还有一种处理方式，就是提前设置这个 cache 变量的值，使得 configure 在检查时直接读取 cache 变量的值而跳过检查的环节。

在 configure 中，`ac_cv_` 前缀的变量通常都是 cache 变量，而 `CACHED_CONFIGUREVARS` 变量就是 yocto 用来设置 configure 中 cache 变量的方法。

````
CACHED_CONFIGUREVARS += "ac_cv_enable_implicit_function_declaration=no"
````

这样执行 configure 结束后，就可以在 config.log 中看到该变量的值了

![cache vars](/images/columns/cache_var_in_configure.png)

这些 cache 变量可以在 config.log 中查看，也可以在 configure 脚本中查找。

## 内容小结

本篇文章，我们分析了 yocto 对 cmake 和 autoconf 构建工具的封装实现，其实就是针对 cmake 和 autoconf 实现的对外的接口，用户在 recipe 中直接通过 inherit 的方式就可以直接实现调用这些构建工具的功能。

如果有其他类似的构建工具，可以参考这种实现方式，通过 bbclass 的方式进行封装，提供统一的对外函数，来实现自定义的构建方式。

- 梳理构建流程，设计提供给外部用户使用的变量
  - 比如定义 `EXTRA_CONF` 变量，用于用户自定义额外的配置参数
- 定义 `do_configure`, `do_compile`, `do_install` task 函数
- 抽象 prefuncs 和 postfuncs 接口，用于用户自定义额外的操作
- ...
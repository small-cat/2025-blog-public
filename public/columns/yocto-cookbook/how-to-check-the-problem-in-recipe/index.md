大家好，我是吴震宇。

无论是通过 bbappend 的方式扩展 recipe，还是为一个新的 package 添加一个新的 recipe，亦或是在当前构建中引入一个开源的 layer，都可能会碰到各种问题。

本文就来讨论一下，当使用 bitbake 构建系统出现 error 时，可以通过哪些手段来排查这些错误。

## 日志
首先就是检查日志。bitbake 在构建时出现错误停止运行时，在控制台的最后，都会打印出现错误的 recipe 的位置。但是仅仅知道出现错误的 recipe 是不够的。我们至少需要知道两个信息：
- 出现错误的 recipe 以及 recipe 的位置
- 构建的 task 的名称
task 可能是 target machine 的任务，也可能是 native 的任务。

从 bitbake 错误信息处可以知道出现错误的 recipe 的位置，同时，在 bitbake 的最新日志文件中，可以查看到出现错误的 task 的名称，该日志就是 `build/tmp/log/cooker/MACHINE/console-latest.log`，该文件是执行最新日志文件的一个 soft link，日志文件名都是时间戳的方式来命名的。该日志文件中，也会包含整个错误信息。

```
ERROR: make-cross-4.2.1-r1 do_compile: ExecutionError('/workspace/test/poky/build/tmp/work/cortexa57-poky-linux/make-cross/4.2.1-r1/temp/run.do_compile.93038', 2, None, None)
```

`build/tmp/log/cooker/MACHINE/console-latest.log` 中的日志信息是当前构建过程完整的日志信息，包括所有的 recipe 的构建日志。更加精细化的定位，就是到出现错误的 recipe 的构建目录中 `${WORKDIR}/temp` 中去查看出现错误的 task 的日志信息，上面日志中也给出了该日志文件的位置。表示的是 make-cross 这个 recipe 的 do_compile 任务出现了错误。

对于 shell 脚本的错误，可以手动执行 `./run.do_compile` 脚本直接复现错误，或者在 shell 脚本中一些打印信息来单步跟踪一下，看下出现问题的具体位置来排查问题。如果是 python 脚本就不能直接运行了，因为 python 脚本中是该 task 的函数定义，必须依托于 bitbake 的运行环境才能正确运行。

另一种方式，就是在 bitbake 执行时使用 `-v` 参数，该参数会将日志打印在控制台上，通过 bb.note 的日志都会在 `-v` 参数启用时将日志信息打印出来。

对于 python 脚本的错误，可以使用 `bitbake -v` 或者 `bitbake -vv` 或者 `bitbake -vvv` 来查看更加详细的日志信息。

## 添加打印
如果不能通过日志直接定位出具体的问题，可以在 recipe 中添加一些打印信息，来辅助排查问题。

前面章节也介绍到过 recipe 中的各种不同风格的函数。如果是 bitbake-style 的 python 函数，默认是可以直接使用全局变量 d 的，可以直接在该 python 函数中，使用 
```
varb = d.getVar('XXXX')
```
来获取变量 XXXX 的值的。如果是标准 python 函数，使用 `def test()` 的方式定义的 python 函数，需要传入参数 `d` 才能使用上述方式来获取变量的值。

python 函数中的打印可以使用下面几个函数
```
bb.note()
bb.warn()
bb.error()
bb.fatal
```
而在 shell 中，可以使用类似的函数
```
bbnote
bbwarn
bberror
bbfatal
```

上述函数，都是在 task 执行期间执行的，而 python 匿名函数，是在 task 执行之前，recipe 解析之后执行的。通过 python 匿名函数，可以打印一些变量信息，检查 bitbake 解析完 recipe 后，为相关 task 准备的环境是否正确。

查看 bitbake 设置的某个变量的值，可以通过
```
bitbake -e | grep XXX
```

当然，如果是 recipe 的语法问题，可以通过
```
bitbake -p
```
的方式检查，该方式只解析 recipe(解析 recipe 中的变量语法，检查 shell 语法以及 python 语法)，而不执行。

## 使用 devshell 运行时调试
使用 bitbake 的 devshell 命令可以调用 devshell 工具。比如
```
bitbake make-cross -c devshell
```
此时 bitbake 构建的目标是 make-cross，该命令将为 make-cross 运行 `do_patch` 之前的所有任务，包括 `do_patch`，然后打开一个新的终端，并进入到 `${S}` 目录中。此时运行的终端环境中，与 bitbake 运行时设置的环境一致，仍然定义了所有与 OpenEmbedded 构建相关的环境变量，可以使用 shell 命令来打印查看，也可以使用 configure 或者 make 的命令的方式来单步执行和调试。
```
bitbake make-cross -c devshell
...
...
...
root@localhost:/workspace/src/make-4.2.1#
```
进入了 make 的源代码目录中，make-cross 的 recipe 中源代码路径是通过 EXTERNALSRC 指定的 local path。此时，在这个终端上，就可以通过 shell 命令来查看当前的一些环境变量了。

## 内容小结
本章介绍了当使用 bitbake 构建出现问题时排查问题的几个思路。

一个是通过日志来定位问题，首先需要知道出现错误的是哪个 recipe，然后再判断出现错误的 task，在该 task 对应的日志中去找到具体错误发生的原因。

另一个是在 recipe 中添加打印信息，来逐步定位问题发生的原因。

还有一种方式，就是使用 devshell 工具，调试某个 target 在 `do_patch` 执行后的整个环境，可以通过 shell 命令单步执行 configure 和 make 来查看整个编译过程。
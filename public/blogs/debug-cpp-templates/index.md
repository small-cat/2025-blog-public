c++ 是一门静态编程语言，可以使用 gcc 或者 clang 进行编译。这里所说的编译，简单来说就是预编译，编译，汇编，链接的过程。

再细致的进行划分，就是编译器的前端通过 scanner 将原代码文件解析成一个个的 token 流，再通过 parser，一般指递归下降解析器解析成抽象语法树 ast，再转变成中间表示 ir，clang 中就是 llvm ir，gcc 中就是 gimple。然后经过中端优化，也就是机器无关优化，lower 到特定机器相关的汇编代码。

编译到汇编之后，经过汇编器翻译成 .o 的二进制文件，在 linux 中为 elf 格式的目标文件，然后经过链接器进行链接，变成最终的可执行文件。

而预编译阶段，在 C/C++ 中，就是 include 头文件，并通过文本替换的方式替换源代码中的宏。预编译后的文件，以 .i 结尾，此时的文件，包含了 include 中的头文件的内容，同时将宏都进行了替换，可以看成是编译前的一个完整的编译单元 translation unit。编译器在此基础上再进行编译。而 c++ 中的模版，比如模版展开，模版实例化，都是在编译期间做的事情。

通常在编写 c++ 模版程序的时候，需要调试模版，或者尝试模版展开都是一个比较麻烦的过程，那是否有一个工具可以辅助以 gdb 或者 lldb 一样的方式能够以单步跟踪的方式帮助你展开模版呢？

借助 templight 可以达到这样的效果。

# 从抽象语法树的角度
c++ 模版展开是在编译期间所做的事情，注定我们无法通过 gdb 或者 lldb 这样的程序在运行时查看，只能在编译器编译期间查看。

看一个简单的实例程序，通过模版的方式求斐波那契数列，在编译期间就可以直接得出结果。

```c++
template <unsigned int N>
struct Fibonacci;

template <>
struct Fibonacci<0> { static const unsigned int value = 0;  };

template <>
struct Fibonacci<1> { static const unsigned int value = 1;  };

template <unsigned int N>
struct Fibonacci {
    static const unsigned int value = Fibonacci<N-1>::value + Fibonacci<N-2>::value;

};

int main(int argc, char *argv[]) {
  return Fibonacci<5>::value;
}

```

通过 clang 编译运行
```
# clang++ test.cpp
# ./a.out
# echo $? // 看下返回结果
```
![compile](https://pic4.zhimg.com/80/v2-fffdb7faeb8d22c4e8c46a5460883831.png)
结果符合预期。

同样我们可以通过 clang 抽象语法树的形式，可以看到在编译器编译时的抽象语法树中，已经对模版进行了实例化

```
clang++ -Xclang -ast-dump -fsyntax-only main.cpp
```
截取关键部分
```
|-ClassTemplateDecl 0x1440e8f08 <main.cpp:2:1, line:3:8> col:8 Fibonacci
| |-NonTypeTemplateParmDecl 0x1440e8e08 <line:2:11, col:24> col:24 'unsigned int' depth 0 index 0 N
| |-CXXRecordDecl 0x1440e8e78 <line:3:1, col:8> col:8 struct Fibonacci
| |-ClassTemplateSpecialization 0x1440e9170 'Fibonacci'
| |-ClassTemplateSpecialization 0x144103a00 'Fibonacci'
| |-ClassTemplateSpecializationDecl 0x144104850 <line:11:1, line:15:1> line:12:8 struct Fibonacci definition
| | |-DefinitionData pass_in_registers empty aggregate standard_layout trivially_copyable pod trivial literal has_constexpr_non_copy_move_ctor can_const_default_init
| | | |-DefaultConstructor exists trivial constexpr needs_implicit defaulted_is_constexpr
| | | |-CopyConstructor simple trivial has_const_param needs_implicit implicit_has_const_param
| | | |-MoveConstructor exists simple trivial needs_implicit
| | | |-CopyAssignment simple trivial has_const_param needs_implicit implicit_has_const_param
| | | |-MoveAssignment exists simple trivial needs_implicit
| | | `-Destructor simple irrelevant trivial needs_implicit
| | |-TemplateArgument integral 5
| | |-CXXRecordDecl 0x144105868 <col:1, col:8> col:8 implicit struct Fibonacci
| | `-VarDecl 0x1441058f8 <line:13:5, col:79> col:31 referenced value 'const unsigned int' static cinit
| |   `-BinaryOperator 0x144109758 <col:39, col:79> 'unsigned int' '+'
| |     |-ImplicitCastExpr 0x1441096f8 <col:39, col:55> 'unsigned int' <LValueToRValue>
| |     | `-DeclRefExpr 0x1441096c8 <col:39, col:55> 'const unsigned int' lvalue Var 0x144105c90 'value' 'const unsigned int' non_odr_use_constant
| |     `-ImplicitCastExpr 0x144109740 <col:63, col:79> 'unsigned int' <LValueToRValue>
| |       `-DeclRefExpr 0x144109710 <col:63, col:79> 'const unsigned int' lvalue Var 0x144106020 'value' 'const unsigned int' non_odr_use_constant
| |-ClassTemplateSpecializationDecl 0x144105a08 <line:11:1, line:15:1> line:12:8 struct Fibonacci definition
| | |-DefinitionData pass_in_registers empty aggregate standard_layout trivially_copyable pod trivial literal has_constexpr_non_copy_move_ctor can_const_default_init
| | | |-DefaultConstructor exists trivial constexpr needs_implicit defaulted_is_constexpr
| | | |-CopyConstructor simple trivial has_const_param needs_implicit implicit_has_const_param
| | | |-MoveConstructor exists simple trivial needs_implicit
| | | |-CopyAssignment simple trivial has_const_param needs_implicit implicit_has_const_param
| | | |-MoveAssignment exists simple trivial needs_implicit
| | | `-Destructor simple irrelevant trivial needs_implicit
| | |-TemplateArgument integral 4
| | |-CXXRecordDecl 0x144105c00 <col:1, col:8> col:8 implicit struct Fibonacci
| | `-VarDecl 0x144105c90 <line:13:5, col:79> col:31 referenced value 'const unsigned int' static cinit
| |   `-BinaryOperator 0x1441094b8 <col:39, col:79> 'unsigned int' '+'
| |     |-ImplicitCastExpr 0x144109458 <col:39, col:55> 'unsigned int' <LValueToRValue>
| |     | `-DeclRefExpr 0x144109428 <col:39, col:55> 'const unsigned int' lvalue Var 0x144106020 'value' 'const unsigned int' non_odr_use_constant
| |     `-ImplicitCastExpr 0x1441094a0 <col:63, col:79> 'unsigned int' <LValueToRValue>
| |       `-DeclRefExpr 0x144109470 <col:63, col:79> 'const unsigned int' lvalue Var 0x1441063b0 'value' 'const unsigned int' non_odr_use_constant
| |-ClassTemplateSpecializationDecl 0x144105da0 <line:11:1, line:15:1> line:12:8 struct Fibonacci definition
| | |-DefinitionData pass_in_registers empty aggregate standard_layout trivially_copyable pod trivial literal has_constexpr_non_copy_move_ctor can_const_default_init
| | | |-DefaultConstructor exists trivial constexpr needs_implicit defaulted_is_constexpr
| | | |-CopyConstructor simple trivial has_const_param needs_implicit implicit_has_const_param
| | | |-MoveConstructor exists simple trivial needs_implicit
| | | |-CopyAssignment simple trivial has_const_param needs_implicit implicit_has_const_param
| | | |-MoveAssignment exists simple trivial needs_implicit
| | | `-Destructor simple irrelevant trivial needs_implicit
| | |-TemplateArgument integral 3
| | |-CXXRecordDecl 0x144105f90 <col:1, col:8> col:8 implicit struct Fibonacci
| | `-VarDecl 0x144106020 <line:13:5, col:79> col:31 referenced value 'const unsigned int' static cinit
| |   `-BinaryOperator 0x144109218 <col:39, col:79> 'unsigned int' '+'
| |     |-ImplicitCastExpr 0x1441091b8 <col:39, col:55> 'unsigned int' <LValueToRValue>
| |     | `-DeclRefExpr 0x144109188 <col:39, col:55> 'const unsigned int' lvalue Var 0x1441063b0 'value' 'const unsigned int' non_odr_use_constant
| |     `-ImplicitCastExpr 0x144109200 <col:63, col:79> 'unsigned int' <LValueToRValue>
| |       `-DeclRefExpr 0x1441091d0 <col:63, col:79> 'const unsigned int' lvalue Var 0x144103cb0 'value' 'const unsigned int' non_odr_use_constant
| `-ClassTemplateSpecializationDecl 0x144106130 <line:11:1, line:15:1> line:12:8 struct Fibonacci definition
|   |-DefinitionData pass_in_registers empty aggregate standard_layout trivially_copyable pod trivial literal has_constexpr_non_copy_move_ctor can_const_default_init
|   | |-DefaultConstructor exists trivial constexpr needs_implicit defaulted_is_constexpr
|   | |-CopyConstructor simple trivial has_const_param needs_implicit implicit_has_const_param
|   | |-MoveConstructor exists simple trivial needs_implicit
|   | |-CopyAssignment simple trivial has_const_param needs_implicit implicit_has_const_param
|   | |-MoveAssignment exists simple trivial needs_implicit
|   | `-Destructor simple irrelevant trivial needs_implicit
|   |-TemplateArgument integral 2
|   |-CXXRecordDecl 0x144106320 <col:1, col:8> col:8 implicit struct Fibonacci
|   `-VarDecl 0x1441063b0 <line:13:5, col:79> col:31 referenced value 'const unsigned int' static cinit
|     `-BinaryOperator 0x144106758 <col:39, col:79> 'unsigned int' '+'
|       |-ImplicitCastExpr 0x1441066f8 <col:39, col:55> 'unsigned int' <LValueToRValue>
|       | `-DeclRefExpr 0x1441066c8 <col:39, col:55> 'const unsigned int' lvalue Var 0x144103cb0 'value' 'const unsigned int' non_odr_use_constant
|       `-ImplicitCastExpr 0x144106740 <col:63, col:79> 'unsigned int' <LValueToRValue>
|         `-DeclRefExpr 0x144106710 <col:63, col:79> 'const unsigned int' lvalue Var 0x1440e9420 'value' 'const unsigned int' non_odr_use_constant
|-ClassTemplateSpecializationDecl 0x1440e9170 <line:5:1, line:6:61> col:8 struct Fibonacci definition
| |-DefinitionData pass_in_registers empty aggregate standard_layout trivially_copyable pod trivial literal has_constexpr_non_copy_move_ctor can_const_default_init
| | |-DefaultConstructor exists trivial constexpr needs_implicit defaulted_is_constexpr
| | |-CopyConstructor simple trivial has_const_param needs_implicit implicit_has_const_param
| | |-MoveConstructor exists simple trivial needs_implicit
| | |-CopyAssignment simple trivial has_const_param needs_implicit implicit_has_const_param
| | |-MoveAssignment exists simple trivial needs_implicit
| | `-Destructor simple irrelevant trivial needs_implicit
| |-TemplateArgument integral 0
| |-CXXRecordDecl 0x1440e9378 <col:1, col:8> col:8 implicit struct Fibonacci
| `-VarDecl 0x1440e9420 <col:23, col:57> col:49 referenced value 'const unsigned int' static cinit
|   `-ImplicitCastExpr 0x1440e94a8 <col:57> 'const unsigned int' <IntegralCast>
|     `-IntegerLiteral 0x1440e9488 <col:57> 'int' 0
|-ClassTemplateSpecializationDecl 0x144103a00 <line:8:1, line:9:61> col:8 struct Fibonacci definition
| |-DefinitionData pass_in_registers empty aggregate standard_layout trivially_copyable pod trivial literal has_constexpr_non_copy_move_ctor can_const_default_init
| | |-DefaultConstructor exists trivial constexpr needs_implicit defaulted_is_constexpr
| | |-CopyConstructor simple trivial has_const_param needs_implicit implicit_has_const_param
| | |-MoveConstructor exists simple trivial needs_implicit
| | |-CopyAssignment simple trivial has_const_param needs_implicit implicit_has_const_param
| | |-MoveAssignment exists simple trivial needs_implicit
| | `-Destructor simple irrelevant trivial needs_implicit
| |-TemplateArgument integral 1
| |-CXXRecordDecl 0x144103c08 <col:1, col:8> col:8 implicit struct Fibonacci
| `-VarDecl 0x144103cb0 <col:23, col:57> col:49 referenced value 'const unsigned int' static cinit
|   `-ImplicitCastExpr 0x144103d38 <col:57> 'const unsigned int' <IntegralCast>
|     `-IntegerLiteral 0x144103d18 <col:57> 'int' 1
|-ClassTemplateDecl 0x144103ed8 prev 0x1440e8f08 <line:11:1, line:15:1> line:12:8 Fibonacci
| |-NonTypeTemplateParmDecl 0x144103dd8 <line:11:11, col:24> col:24 referenced 'unsigned int' depth 0 index 0 N
| |-CXXRecordDecl 0x144103e48 prev 0x1440e8e78 <line:12:1, line:15:1> line:12:8 struct Fibonacci definition
| | |-DefinitionData empty aggregate standard_layout trivially_copyable pod trivial literal has_constexpr_non_copy_move_ctor can_const_default_init
| | | |-DefaultConstructor exists trivial constexpr needs_implicit defaulted_is_constexpr
| | | |-CopyConstructor simple trivial has_const_param needs_implicit implicit_has_const_param
| | | |-MoveConstructor exists simple trivial needs_implicit
| | | |-CopyAssignment simple trivial has_const_param needs_implicit implicit_has_const_param
| | | |-MoveAssignment exists simple trivial needs_implicit
| | | `-Destructor simple irrelevant trivial needs_implicit
| | |-CXXRecordDecl 0x144103f98 <col:1, col:8> col:8 implicit struct Fibonacci
| | `-VarDecl 0x144104040 <line:13:5, col:79> col:31 value 'const unsigned int' static cinit
| |   `-BinaryOperator 0x144104468 <col:39, col:79> '<dependent type>' '+'
| |     |-DependentScopeDeclRefExpr 0x144104250 <col:39, col:55> '<dependent type>' lvalue
| |     `-DependentScopeDeclRefExpr 0x144104430 <col:63, col:79> '<dependent type>' lvalue
| |-ClassTemplateSpecialization 0x1440e9170 'Fibonacci'
| |-ClassTemplateSpecialization 0x144103a00 'Fibonacci'
| |-ClassTemplateSpecialization 0x144104850 'Fibonacci'
| |-ClassTemplateSpecialization 0x144105a08 'Fibonacci'
| |-ClassTemplateSpecialization 0x144105da0 'Fibonacci'
| `-ClassTemplateSpecialization 0x144106130 'Fibonacci'
```

简单说一下抽象语法树的构成
![ast](https://pic4.zhimg.com/80/v2-11014e2ed565bbab930e7f03059c280e.png)
每一行描述的都是一个 ast node 的信息，比如上图中的第一行，
- ClassTemplateSpecializationDecl 就是 clang 中抽象语法树的一个 node 名称，从字面意思可以看出，这就是一个模版特化声明。` <line:8:1, line:9:61>` 表示的是该声明在源代码文件中的 location。可以继续看下该声明的内容，ast 中列出了该 struct 中隐式声明的相关构造和析构函数。
- TemplateArgument 表示模版参数，是 integral 类型的节点
- CXXRecordDecl 在 clang ast 中用来表示 struct 或者 class

clang 抽象语法树的展示就是一种层级结构，能形象的表示树的结构形式。在抽象语法树的最后，我们可以看到有五次模版特化的过程。

既然编译器已经做好了这些事情，那是否可以从编译器的角度，在编译阶段，让模版展开和特化的过程一步一步呈现出来呢。templight 就做了这些事情。

# 使用 templight
> Templight(`https://github.com/mikael-s-persson/templight`) is a Clang-based tool to profile the time and memory consumption of template instantiations and to perform interactive debugging sessions to gain introspection into the template instantiation process.

templight 是基于 clang 开发的，无法独立编译和运行，必须基于 clang 源码树的基础上完成编译。

## 编译
我这里选取了 llvm-14 的版本进行编译的。如果选取其他的 llvm 版本，先看下 templight 当前版本是否兼容，如果不兼容，编译会通不过，因为 llvm api 版本迭代之间变化较大，很多时候不能兼容老版本。

首先下载 llvm 14
```
git clone http://gitlab.alibaba-inc.com/AliOSCompiler/clang_llvm.git -b llvmorg-14.0.6
```

然后 clone templight
```
cd clang_llvm
cd clang/tools
git clone https://github.com/mikael-s-persson/templight.git
```
注意，templight 放在 llvm 源码树的 clang/tools 目录下，同时需要在 `clang/tools/CMakeLists.txt` 中将 templight 加入编译
```
add_clang_subdirectory(templight)
```
因为我选取的是 llvm-14，需要将 templight 回退到与 14 兼容的 commit id
```
cd templgiht
git reset --hard b4fdd78d8d66ee955394403e8e4d9e05f688bf6e
```
回到 llvm 源码的根目录，进行编译
```
mkdir build
cd build
cmake -DLLVM_ENABLE_PROJECTS=clang ../llvm
make -j12
```
这里只 enable 了 clang，其他的暂时不需要。llvm 也支持 ninja 的方式进行编译，在生成配置时，使用 ninja 即可
```
cmake -G ninja -DLLVM_ENABLE_PROJECTS=clang ../llvm
```
编译完成后，会在 `build/bin` 目录下生成 templight 和 templight++ 这两个可执行文件。其实这两个文件，也是 clang driver 程序，只是增加了 templight 的功能的 clang 编译器。可以使用 -v 来查看版本信息
```
$ ./templight++ --version
clang version 14.0.6 (https://github.com/llvm/llvm-project.git f28c006a5895fc0e329fe15fead81e37457cb1d1)
Target: arm64-apple-darwin22.6.0
Thread model: posix
InstalledDir: /opt/source_code/llvm-project/build-templight/bin/.
```

## usage
使用 `--help` 可以查看帮助信息。
```
$ ./templight --help
Templight options (USAGE: templight [[-Xtemplight [templight option]]|[options]] <inputs>)

  --stdout             - Output template instantiation traces to standard output.
  --memory             - Profile the memory usage during template instantiations.
  --safe-mode          - Output Templight traces without buffering,
                         not to lose them at failure (note: this will
                         distort the timing profiles due to file I/O latency).
  --ignore-system      - Ignore any template instantiation coming from
                         system-includes (-isystem).
  --profiler           - Start an interactive Templight debugging session.
  --debugger           - Start an interactive Templight debugging session.
  --output=<string>    - Write Templight profiling traces to <file>.
  --blacklist=<string> - Use regex expressions in <file> to filter out undesirable traces.

...... (后面的内容是 clang 的帮助信息)
```
我们在编译时，可以使用 templight 的 `--profiler` 和 `--debugger` 这两个选项，在使用 templight 进行编译时，进入交互式模式，能查看模版展开的过程。templight 的参数传递，必须通过 `-Xtemplight` 的方式，这类似于 clang 传递参数给 linker，必须使用 `-Xlinker`, 或者 gcc 传递给 ld 必须使用 `-Wl` 一样，也就是说，使用这两个调试的参数，需要这样来传递参数
```
-Xtemplight --profiler -Xtemplight --debugger
```
**注意**：templight 的这个功能，是针对具体的 translation unit 的。也就是说，如果有很多 cpp 文件，你相对其中某一个文件使用 templight 的交互模式，就只对这一个文件使用上面这两个参数进行编译。在编译期间，当编译到这个文件时，就会进入到交互模式，其余文件的编译保持不变。
下面我们对上面那个斐波那契程序来做一个小实验。

使用 templight++ 对 `main.cpp` 进行编译。
```
templight++ -Xtemplight --profiler -Xtemplight --debugger main.cpp
```
注意，如果是 mac 电脑，这里的配置与 linux 稍有不同，在 mac 中 sysroot 默认与 linux 是不同的，需要手动指定。这里如果不知道 sysroot 参数，可以使用 mac 电脑上已安装的 clang++ 使用 `-v` 参数编译一下，查看编译参数。通常如下
```
templight++ -Xtemplight --profiler -Xtemplight --debugger -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -I/usr/local/include main.cpp
```
因为我们使用了 `--profiler` 和 `--debugger` 参数，编译时会进入交互界面。
```
Welcome to the Templight debugger!
Begin by entering 'run' after setting breakpoints.
(tdb) b Fibonacci
Breakpoint 0 for Fibonacci
(tdb) r
Entering template instantiation of Fibonacci<5>
  at main.cpp|19|10 (Memory usage: 0)
```
templight 中的指令与 gdb 和 lldb 中类似。b 也就是 break 设置断点。r 表示执行编译。

介绍移一下相关的指令操作：
- break `<template name>`，表示在模版类或者模版函数的实例化的地方设置断点，编译器会在实例化该模版的时候停止
- r/run，表示继续执行编译过程内
- info break 查看断点信息，会显示所有断点信息及其索引
- delete `<breakpoint index>` 删除断点
- kill/quit 表示退出 templight 调试过程，编译器编译当前文件指导编译任务完成退出
- step/s, step into the template instantiation，该操作会进入到嵌套实例化的模版
- next/n, skip to the end of the current template instantiation，该操作会跳过嵌套实例化的模版
- backtrace/bt，打印当前嵌套模版实例化的过程
- setmode [verbose | quiet], verbose 会打印详细输出，而 quiet 表示静默输出

其他参数可以查看文档(https://github.com/mikael-s-persson/templight?tab=readme-ov-file#getting-started)

下面我们通过上述的例子来展示一下 templight 的这些功能。
```
(tdb) s
Leaving  template instantiation of Fibonacci<5>
  at main.cpp|19|10 (Memory usage: 0)
(tdb) whois Fibonacci
Found Fibonacci
  at main.cpp|12|8
(tdb) s
Entering template instantiation of Fibonacci<5>
  at main.cpp|19|10 (Memory usage: 0)
```
s 进入模版实例化 Fibonacci<5>，同时显示了该模版实例化的 location 的位置
```
(tdb) s
Entering template instantiation of Fibonacci<4>
  at main.cpp|13|39 (Memory usage: 0)
    static const unsigned int value = Fibonacci<N-1>::value + Fibonacci<N-2>::value;
```
这是一个嵌套模版实例化，进入了到了 Fibonacci<4> 这个实例化的模版，再 step 会进入到 Fibonacci<3>
```
Entering template instantiation of Fibonacci<3>
  at main.cpp|13|39 (Memory usage: 0)
    static const unsigned int value = Fibonacci<N-1>::value + Fibonacci<N-2>::value;
```
通过 backtrace 可以查看整个模版实例化嵌套的过程
```
(tdb) bt
template instantiation of Fibonacci<3> at main.cpp|13|39
template instantiation of Fibonacci<4> at main.cpp|13|39
template instantiation of Fibonacci<5> at main.cpp|19|10
```
quit 退出交互模式，编译器继续编译直到完成编译。
```
(tdb) quit
Templight debugging session has ended. Goodbye!
```

好了，以上就是我今天的分享，希望对你有所帮助。
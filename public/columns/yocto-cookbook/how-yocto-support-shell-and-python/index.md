大家好，我是吴震宇。

经过前面基础篇的讨论，相信大家已经对 yocto 的概念，yocto 的基本操作以及如何使用 yocto 来构建定制化的 image 有了一些了解。yocto 构建系统是一个很复杂的系统，想要深入的理解，需要

- 反复实践
- 阅读开源的 layer 实现
- 阅读官方手册文档
- 阅读 bitbake 源代码，掌握实现原理。  
  这样才能进一步的深入了解 yocto，同时能根据自己的需求实现对 yocto 的扩展。

我们也遵循着这一原则，并尝试从实现原理和一些特定场景需求的角度，来深入探讨 yocto，这也是接下来进阶篇要讨论的内容。准备好小板凳，我们开始吧。

在 yocto 中编写 recipe 的时候，最常见的就是 recipe 中使用的 python 函数和 shell 函数。在同一个 recipe 中，可以同时支持 shell 语法和 python 语法。而 bitbake 工具本身是通过 python 来实现的。那么 bitbake 是如何实现同时对这两种脚本的支持的呢。

bitbake 中实现了一个 `lib/bb/codeparser.py` 模块，该模块用于解析 shell 或者 python 函数，以及一些 in-line 表达式。所谓的 in-line 表达式，就是形如

````
${expr}
${@bb.filter(...)}
````

这类的表达式。bitbake 实现了一个 cache 来保存解析过的 shell 或者 python 函数，避免重复解析，以加快解析的速度。每一个解析过的 shell 或者 python 函数，都有一个对应的 cache key。

先来看一下 recipe 中 shell 和 python 的函数都有哪些形式。

## functions

### functions in recipe

recipe 中的函数有 shell 函数以及 bitbake 风格的 python 函数。这两种函数声明形式类似，就是 bitbake 风格的 python 函数有一个 python 关键字，而 shell 函数没有。两种函数都可以通过 append/prepend 关键字，在原有函数的基础上添加新的内容。

- prepend 是在当前函数的前面添加内容，比如 test_func:prepend
- append 是在当前函数的后面添加内容，比如 test_func:append

shell 函数中使用 shell 语法，bitbake 生成的 shell 脚本默认使用的 `#!/bin/sh` 解释器，一般是 dash，所以编写的脚本最好使用的 dash 兼容的语法形式。当然，也可以直接将当前构建环境中的 sh 设置成 bash，这样就方便了，可以统一写成 bash 语法即可。而 python 函数中使用正常的 python 语法即可。高版本的 python 中使用的是 python3，这点注意一下。

````
# shell function
do_install() {
  echo "exec shell function do_install"
  ...
}

# python function of bitbake style
python do_install() {
  print('exec python function do_install')
  ...
}
````

另外还有 python 形式的标准函数，以及 python 匿名函数。

````
# python 标准函数
def get_toolchain_path(d):
  if d.getVar('EXTERNAL_TOOLCHAIN_PATH', False):
    return d.getVar('EXTERNAL_TOOLCHAIN_PATH')
  else:
    return ""

# python 匿名函数
python () {
  print('exec python anonymous function')
  print('EXTERNAL_TOOLCHAIN_PATH = {}'.format(d.getVar('EXTERNAL_TOOLCHAIN_PATH')))
  ...
}
````

无论是 python 标准函数还是 python 匿名函数，都必须遵循 python 语法。

在 bitbake 上下文中，默认 import 了两个 python module，分别是 bb 和 os。也就是说 python 匿名函数和 bitbake 风格的 python 函数中，都默认 import 了 bb 和 os，可以直接使用。同时 d 作为一个全局变量保存了当前 bitbake 的上下文信息，也可以直接使用。而 python 标准函数中没有共享这些上下文，d 也必须通过参数传递进去才能使用。

因为默认 import 了 bb，所以在 python 匿名函数或者 bitbake 风格的 python 函数中，可以使用下面的函数打印信息，使用 print 是无法正常显示信息的

````
bb.plain()
bb.note()
bb.warn()
bb.error()
bb.fatal()
````

shell 函数中也有对应的函数，可以打印信息

````
bbplain
bbnote
bbwarn
bberror
bbfatal
````

bitbake 解析 shell 的这几个命令时，会将其转换成上述的 python 接口，在 `lib/bb/build.py` 中可以看到

![bb log print](/images/columns/bb-log.png)

bitbake 风格的 python 函数和 python 标准函数的区别

| bitbake-style python function                                                              | regular python function                              |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 必须以 python 关键字开头                                                                   | 以 def 开头的函数声明                                |
| 可以定义为 task 使用                                                                       | 不能定义为 task 使用，只能作为 task 中的一个函数调用 |
| 可以使用 recipe 中的 override 语法或者 override-style operator，比如 append，prepend       | 不能                                                 |
| 可以使用 variable flags，比如 [dirs], [cleandirs] 等                                       | 不能                                                 |
| bitbake 会为其生成 run.function_name.pid 的脚本，执行后会生成 log.function_name.pid 的日志 | 不能                                                 |
| 可以直接被 bitbake 调用，或者通过 `bb.build.exec_func` 接口的方式调用                      | 被 python 函数调用                                   |

### 函数执行时机

shell 函数和 bitbake-style python 函数都是作为 task 来使用的，或者在 task 对应的函数中被掉用。bitbake-style python 函数也可以调用标准 python 函数。所以这些函数都是在 recipe 解析完之后，通过 task 的方式执行起来的。这些可以通过 task 执行的函数，bitbake 都会为其生成 run.function_name.pid 的脚本，以及 log.function_name.pid 的日志文件，可以在 recipe 对应的 `${WORKDIR}/temp` 目录下找到。

而匿名 python 函数，是在 recipe 解析之后执行的，而不是在 task 中。**也就是说，如果想打印 recipe 中某一个变量的值，是在 recipe 解析后需要打印出来观察的，无论是 python 函数还是在 shell 函数中都不能，只有在 python 匿名函数中才可以做到。**

所以之前经常看到有同学想打印 recipe 中某一个变量的值，使用 shell 函数或者 python 函数，通过 bbnote 或者 bb.note 的方式都不能在 recipe 解析后看到，就是因为这些都是在 task 中执行的。

python 匿名函数在 recipe 中定义的顺序，和 recipe 解析后匿名函数的执行顺序保持一致。比如

````
python () {
    d.setVar('FOO', 'foo 2')
}

FOO = "foo 1"

python () {
    d.appendVar('BAR',' bar 2')
}

BAR = "bar 1"
````

上面这个例子，bitbake 在解析这个 recipe 的时候，先执行

````
FOO = "foo 1"
BAR = "bar 1"
````

解析完之后，在按照 python 匿名函数定义的顺序，依次执行匿名函数

````
FOO = "foo 2"
BAR += " bar 2"
````

python 匿名函数的声明，还可以加上 `__anonymous` 关键字，比如

````
python __anonymous () {
    d.setVar('FOO', 'foo 2')
}
````

## parsers in bitbake

shell 函数和 python 函数都是定义在 recipe 中，也就是说 bitbake 负责解析配方，同时需要将 shell 和 python 区分出来。那我们来看下，bitbake 是如何一步一步解析 recipe 以及其中的 shell 函数和 python 函数的。

### recipe parsing

Bitbake 启动时，是通过 BitbakeServer 来解析 configure 和 recipe 的，然后通过 bitbake-worker 来执行 task。

解析文件时，先解析 `bblayers.conf` 文件，获取相关的 BBPATH，BBLAYERS 变量的信息，然后再找到这些 layer 中的 `conf/layer.conf` 配置，解析其中的 `BBFILES` 等变量，最终通过这些配置信息，找到所有的 recipe 文件并进行解析。

解析 recipe，是通过 `lib/bb/parser:handle` 方法来进行的。

![bb parse handle](/images/columns/bb-parse-handle.png)

在 handlers 中找到对应的处理函数，如果是配方文件，文件后缀为 `.bb`，应该是调用 `lib/bb/parse/parse_py/BBHandler.py`。上面 handle 方法中的 supports 函数，就是确定文件扩展是否是 `.bb`，`.bbclass` 或者 `.inc`。实际的处理函数是名为 `handle` 的方法。

![recipe supports fn](/images/columns/recipe-supports-fn.png)

在解析 recipe 时，关键字的识别，是通过正则表达式的方式来匹配的，

````
__func_start_regexp__    = re.compile(r"(((?P<py>python(?=(\s|\()))|(?P<fr>fakeroot(?=\s)))\s*)*(?P<func>[\w\.\-\+\{\}\$:]+)?\s*\(\s*\)\s*{$" )
__inherit_regexp__       = re.compile(r"inherit\s+(.+)" )
__export_func_regexp__   = re.compile(r"EXPORT_FUNCTIONS\s+(.+)" )
__addtask_regexp__       = re.compile(r"addtask\s+(?P<func>\w+)\s*((before\s*(?P<before>((.*(?=after))|(.*))))|(after\s*(?P<after>((.*(?=before))|(.*)))))*")
__deltask_regexp__       = re.compile(r"deltask\s+(.+)")
__addhandler_regexp__    = re.compile(r"addhandler\s+(.+)" )
__def_regexp__           = re.compile(r"def\s+(\w+).*:" )
````

python 关键字，表示 bitbake-style python 函数，inherit 表示继承的 `.bbclass`，而 addtask 表示添加了一个新的 task 等。

我们以一个 recipe 为例，看下 handle 函数解析 recipe 的过程。首先获取 recipe 文件的路径

````
abs_fn = resolve_file(fn, d)
````

然后，解析该文件中的所有的语句 statements

````
statements = get_statements(fn, abs_fn, base_name)
````

这一句话才是重点，这里将 recipe 解析成了一棵抽象语法树 ast(abstract syntax tree)。`get_statements` 读取 recipe 中的每一行，然后送给 feeder 进行解析。

![get statements fn](/images/columns/get_statements-fn.png)

feeder 按照 statement 的类型，解析成不同的 ast node。因为 feeder 是一行一行的解析 recipe 文件的，函数或者变量的赋值，可能是跨行的，所以这里有很多类似 `__residue__` 这样的保存有一定上下文信息的变量。

````
if s and s[-1] == '\\':
    __residue__.append(s[:-1])
    return
````

这句话表示，如果当前行 s 是以 `\\` 结尾的，那么说明下一行的内容仍然是当前行的拼接，将其保存到 `__residue__` 变量中。直到所有内容全部拼接完成，

````
s = "".join(__residue__) + s
__residue__ = []
````

s 中就是一个完整的语句内容。如果 s 以 `#` 开头，说明这是一个注释，不需要处理。然后根据正则匹配，调用不同的处理句柄。如果是 function，会调用

````
ast.handleMethod(statements, fn, lineno, __infunc__[0], __body__, __infunc__[3], __infunc__[4])
````

handleMethod 实际创建了一个 MethodNode 对象并加入了到了 statements 中。

![handle method fn](/images/columns/handle-method-fn.png)

MethodNode 就是一个 ast 节点。这样，`get_statements` 解析完后，就得到了一个 statements 的 list，每一个 statement 就是一个 ast node。然后通过 eval 方法，对每一个 statement 也就是每一个 ast node 节点进行操作，解析具体的 metadata 信息保存到全局对象 d 中。

````
class StatementGroup(list):
    def eval(self, data):
        for statement in self:
            statement.eval(data)
````

这种操作语法树的方式，就是对抽象语法树 node 节点的遍历过程。

#### recipe 抽象语法树解析

bitbake 中 recipe ast 是一个同型异构树，所有节点都是 AstNode 的子节点。抽象语法树的遍历，可以通过访问器或者监听器两种方式进行，这里的做法就类似一种访问器的方式。

````
AstNode
  -> IncludeNode
  -> ExportNode
  -> UnsetNode
  -> UnsetFlagNode
  -> DataNode
  -> MethodNode
  -> PythonMethodNode
  -> ExportFuncsNode
  -> AddTaskNode
  -> DelTaskNode
  -> BBHandlerNode
  -> InheritNode
````

每一个子节点都需要实现自己的 eval 方法，用来解析自己的 metadata。比如 MethodNode 节点的 eval 实现

![Method eval](/images/columns/methodnode-eval.png)

如果函数名为 `__anonymous`，说明是 python 匿名函数，然后将函数加入到 data 的 `__BBANONFUNCS` 属性中。

如果函数是 python 函数，设置 flag 为 python 属性，如果 fakeroot 标志为 true，设置 flag 为 fakeroot 属性。最终，将函数名和 body 都保存到 data 的 funcname 属性中。

这样一个函数，可能是 python 函数，也可能是 shell 函数。可以根据 flag 进行区分。但是函数体 body 部分还没有进行解析，只是解析了 recipe，保存了 metadata 数据。而实际函数体的解析，还要通过另外的 Parser 进行。

### code parsers in bitbake

`lib/bb/codeparser.py` 中实现了 ShellParser 和 PythonParser 两个 Parser 类，用来解析 shell 和 python 函数。

#### ShellParser

在 codeparser.py 中定义了 ShellParser 这个 class 用于处理 shell 脚本，核心就是 `_parse_shell(value)` 方法，value 就是 shell 命令的字符串形式。

![shell parser](/images/columns/shell-parser.png)

这个方法的思路是将 shell 脚本通过一个 lexer 解析成一个 token 流，然后使用 parser 的方式解析成一棵抽象语法树 ast。这是典型的编译器前端的做法。

bitbake 在 `lib/bb/pysh` 实现了 shell 脚本的 lexer 和 parser。PLYLexer 是一个继承了 Lexer 的类，通过

````
lexer.add(s, True)
````

对 input 的 shell 进行解析。这里解析的 s 代表的是 shell 字符串。比如一个 shell command

````
libs=$(find lib -name "*.so")
````

如果我们要实现一个词法分析器 lexer 来解析这段代码，首先需要定义 TOKEN

````
IDENTIFIER = '[a-zA-Z_][a-zA-Z0-9_]*'
EQUAL_SIGN = '='
DOLLAR = '$'
LPAREN = '('
RPAREN = ')'
MINUS = '-'
STRINGS = '"[^"]*"|\'[^\']*\''
BLANKS = ' \t\n'
FIND = 'find'
````

IDENTIFIER 就是标识符，EQUAL_SIGN 就是等号，DOLLAR 就是美元符号，LPAREN 就是左括号，RPAREN 就是右括号，STRINGS 就是字符串。

当我们需要对上面这个 shell 命令的字符串进行解析时，发现 libs 是一个 TOKEN，表示的是标识符 IDENTIFIER，后面等号也是一个 TOKEN，全部解析完后，就形成了一个 TOKEN 的集合

````
IDENTIFIER: libs
EQUAL_SIGN: =
DOLLAR: $
LPAREN: (
FIND: find
BLANKS: 
IDENTIFIER: lib
BLANKS: 
MINUS: -
IDENTIFIER: name
BLANKS: 
STRINGS: "*.so"
RPAREN: )
````

这里我将 `-name` 解析成了 MINUS IDENTIFIER 两个token，也可以解析成一个组合的token。这是为了演示方便。这种写法有时候在使用 BNF 巴斯克诺尔范式时，如果 token 比较多，如果一个 token 包含了多个其他的 token，那么将其写成产生式而不是 token 的方式会更加方便，否则容易产生歧义。

上面这种形式的 token 集合是我们列举的一个简单例子，而 bitbake 中的 ShellParser 解析出来的更加简单，lexer 的处理没有这么细致，它直接将这整个语句作为一个 token 来处理，而具体的细节是在 parser 中进行的。比如

````
foo () {
  libs=$(find lib -name "*.so")
}
````

lexer 解析的 token 集合为

````
TOKEN: foo
LPARENS: (
RPARENS: )
Lbrace: {
NEWLINE: \n
TOKEN: libs=$(find lib -name "*.so")
NEWLINE: \n
Rbrace: }
````

这样，`libs=$(find lib -name "*.so")`  这个命令就解析成了上述的一个 token 集合。然后再通过 parser，以 GRAMMAR 规则的形式进行匹配解析，最终得到一个抽象语法树。parser 通常指的是递归下降解析器，比如 LR 解析器，L 表示 left，R 表示 right，也就是从左往右解析。parser 解析是以 lexer 提供的 token 为单位。

还是以上述这条命令为例，比如我们需要对这个命令解析，根据 shell 语法规范，我们可以自己写一条文法规则

````
expr : 
  assign_expr |
  paren_expr |
  ...
  
assign_expr : 
  IDENTIFIER EQUAL_SIGN expr

paren_expr : 
  DOLLAR LPAREN cmd RPAREN

cmd :
  find_cmd |
  ...

find_cmd :
  FIND (IDENTIFIER | MINUS IDENTIFIER | STRINGS)+
  
````

上面这个文法规则就是一个很简单的 BNF 形式的上下文无关文法，每一条规则就是一个产生式。这部分内容，我之前写过一个短篇的专栏，有兴趣可以看下[antlr cookbook](https://blog.csdn.net/honglicu123/category_11774314.html)。

那如果使用这样的文法规则实现的 parser 来解析这个命令，得到的是一棵这样的 ast

![shell cmd ast](/images/columns/shell_cmd_ast.png)

bitbake 中的 lexer 和 parser 的实现也是类似的原理。

通过 `pyshlex.PLYLexer` 将 shell 解析成 token 之后，使用 `yacc.parse(lexer=lexer, debug=debug)` 调用 parser 进行解析。这里的 yacc 实际上是一个 parser，在`lib/bb/pysh/pyshyacc.py` 中定义的。

![build the shell parser](/images/columns/shell-build-parser.png)

`yacc()` 方法定义在 `lib/bb/ply/yacc.py` 中，构造了一个 LRParser 对象，而全局变量 parse 就是

````
parse = LRParser.parse
````

LRParser 中的 productions，action 和 goto 就是 parser 在解析 shell 的时候，类似产生式概念，用来判断当前 token 的下一个状态或者下一个 branch 分支。LR 算法也有很多变体，比如 LR(1) 表示会预取下一个 token 来进行判断，LR(k) 表示取 k 个token 来判断下一个状态，理论上获取到的信息越多越能够容易且准确的判断下一个状态。

parser 构造的时候，使用的是 `lib/bb/pysh/pyshtables.py`，其中 `_lr_productions` 中保存的就是产生式，也就是上下文无关文法的表示形式，这也就是 shell 的语法 Grammer。

parser 返回后的 ast 并不是一个树形的形式，而是一个 list，保存的是非终结符 `non-terminal`，`lib/bb/ply/yacc.py:YaccSymbol` 对象。非终结符也就是前面我们自己写的文法规则中产生式冒号左边的符号，右边就是非终结符推导的过程，由终结符和非终结符组成，TOKEN 就是终结符，也就是 ast 的叶子结点。

parser 解析之后，codeparser 会通过 `process_tokens` 对这个保存非终结符列表的 ast 继续进行处理。针对 shell 不同的语句，提取出实际的 cmd 命令。还是上述 find 命令，parser 解析后结果为

````
cmd_name: find
TOKEN: lib
TOKEN: -name
TOKEN: "*.so"
````

最终将 find 这个 command 加入到 `self.allexecs` 中。

### PythonParser

PythonParser 将 python 代码以 compile 接口转换成 python 的 ast，然后通过 ast.walk 结构的方式遍历 ast。再遍历过程中，只处理函数调用的 Call 节点。

![python parser](/images/columns/python-parser.png)

> python 中的 compile 接口，可以将 python 代码编译成字节码，然后通过 exec 或者 eval 方法直接执行。

### 调试方法

bitbake 启动时，是启动 server 进程来解析 recipe 的，然后启动 worker 进程来执行 task。所以如果想调试 parser，通过 bitbake 入口是无法直接跳转到断点的。调试可以通过 bitbake-selftest 的方式来进行调试。

`lib/bb/tests` 中有有很多测试代码，codeparser.py 就是专门测试 codeparser 的单元测试文件。可以通过

````
bitbake-selftest bb.tests.codeparser -v
````

的方式来执行 codeparser 的单元测试，而 parser 处的断点通过改测试程序可以进行调试。

## 内容小结

本文分析了 bitbake 解析 recipe 的方式，bitbake 将 recipe 解析成一个抽象语法树，然后通过遍历 ast，再调用具体的 handler 来获取 metadata 信息。同时实现了 ShellParser 和 PythonParser 来分别解析 shell code 和 python code。

## reference

1. [bitbake functions](https://docs.yoctoproject.org/bitbake/2.6/bitbake-user-manual/bitbake-user-manual-metadata.html#functions)
2. [上下文无关文法相关的博客](https://blog.csdn.net/honglicu123/category_11774314.html)
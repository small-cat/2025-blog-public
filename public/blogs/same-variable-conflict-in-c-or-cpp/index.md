# 两个同名对象一定会造成 redefine 吗

今天讨论一个问题，那就是在 c/c++ 中，比如两个文件中的同名全局变量，一定会造成 redefine 的问题吗？

我们知道，在 c 和 c++ 中，编译器对符号的 mangling 是不同的，c 中通过下划线前缀加上符号的名称的方式，而 c++ 中符号 mangling 的规则要复杂很多，需要加上符号的类型，名称和长度，而函数中，有函数名，长度，参数名，长度和类型，返回值类型不作为 mangling 的元素。

所以在 c 中不能进行函数重载，而 c++ 中可以函数重载，且只需要参数个数，参数类型不同即可，而仅仅返回值不同不能构成函数重载。

那么如果在两个不同的文件中，有两个同名的全局变量，编译链接的时候会发生什么呢，一定会发生 redefine 的错误吗？

## c 中的实验

实验环境：

- OS：Ubuntu 16.04.7 LTS, xenial
- Compiler: gcc 9.4

```c
// 文件 a.c
#include <stdio.h>
int a;

void foo() {
  a = 10;
  printf("%d, %p\n", a, &a);
}
```

这里使用了一个函数进行打印，是因为单纯写一个变量声明 int a；编译器优化时，会认为是一个 unused code，直接作为无用代码消除了。

```c
// b.c
#include <stdio.h>
double a;

void goo() {
  printf("%lf, %p\n", a, &a);
}
```

再添加一个 main.c

```c
// main.c
#include <stdio.h>
extern void foo();
extern void goo();
int main(int argc, char *argv[])
{
  foo();
  goo();
  printf("HelloWorld\n");
  return 0;
}
```

写一个简单的 Makefile 来编译一下

```makefile
SRC=$(shell ls *.c)
OBJS=$(subst .c,.o,${SRC})
$(info OBJS=$(OBJS))

CFLAGS= -g -Wall -O0 #-fcommon

%.o: %.c
	gcc $(CFLAGS) -c $< -o $@

main: $(OBJS)
	gcc $^ -o $@
```

在 c 中，这段代码是可以编译的，且没有警告。编译完后，我们使用 readelf 来看下这几个 elf 文件。(readelf 是一个用于查看ELF格式文件信息的命令行工具)

```shell
# readelf a.o
Symbol table '.symtab' contains 17 entries:
   Num:    Value          Size Type    Bind   Vis      Ndx Name
     0: 0000000000000000     0 NOTYPE  LOCAL  DEFAULT  UND
     1: 0000000000000000     0 FILE    LOCAL  DEFAULT  ABS a.c
......
    14: 0000000000000004     4 OBJECT  GLOBAL DEFAULT  COM a
    15: 0000000000000000    45 FUNC    GLOBAL DEFAULT    1 foo
    16: 0000000000000000     0 NOTYPE  GLOBAL DEFAULT  UND printf
```

从上面可以发现，符号 a 的索引为 COM，表明这是一个 COMMON 的符号。printf 是 libc 中的 api，需要链接 libc.so，UND 表示 undefine。

再看下 b.o 同样如此

```shell
    14: 0000000000000008     8 OBJECT  GLOBAL DEFAULT  COM a
    15: 0000000000000000    39 FUNC    GLOBAL DEFAULT    1 goo
    16: 0000000000000000     0 NOTYPE  GLOBAL DEFAULT  UND printf
```

gcc 编译的 elf 文件中，符号是没有类型的，只能知道这是一个 GLOBAL 对象，OBJECT，符号类型是 COMMON。

无论是在 a.c 还是 b.c 中，符号 a 都是全局且未初始化的，gcc 编译器编译时将其编译成了 COMMON 符号。

### 什么是 COMMON 符号

> from 《程序员的自我修养——链接、装载与库》， chapter 4.3 COMMON 块
> 
> 早期的 Fortran 没有动态分配空间的机制，程序员必须事先声明它所需要的临时空间的大小。Fortran 把这种空间叫做 COMMON 块。当不同的目标文件需要的 COMMON 块空间大小不一致时，以最大的那块为准。

编译器在处理未初始化的全局变量时将其作为弱符号进行处理。而现在的链接机制就是在处理弱符号的时候，采用的与 COMMON 块一样的机制。

COMMON 符号针对的是一种弱符号处理。仅能包含在可重定位目标文件中，而不包含在可执行目标文件中。可执行目标文件，是链接器连接后生成的文件，这时，链接器会对符号进行处理，针对 COMMON 这种弱符号

- 如果出现两个以上的同名强符号，会直接报 redefine 的错误
- 如果有一个同名的是强符号，其他都是弱符号，那链接的结果以强符号的为准。但是如果弱符号 size 大小比强符号大，链接器会发出告警
- 如果两个以上都是弱符号，链接结果以size最大的为准

编译器在编译成目标文件时，COMMON 所表示的弱符号因为没有确定最终所占空间的大小，此时无法在 BSS 段分配空间。只有在链接阶段确定了实际所占内存大小之后，才会在BSS段为其分配空间。最终**未初始化的全局变量就是保存在 BSS 段中的**。

### 总结

c 中 COMMON 符号其实就是一种弱符号。像上面的例子中的变量申明的情况，未初始化的全局变量，在单个编译单元中编译成目标文件时，就属于一种弱符号，编译器作为 COMMON 符号进行处理。这样最终在链接时，根据多个弱符号，去最大的为准的原则，最终以 double 作为 a 的 size 大小，保存到 BSS 段中。

## cpp 中的实验

将上面的代码改成 cpp，使用 g++ 进行编译。可以查看一下 a.cpp.o

```shell
# readelf -sW a.cpp.o
Symbol table '.symtab' contains 12 entries:
   Num:    Value          Size Type    Bind   Vis      Ndx Name
     0: 0000000000000000     0 NOTYPE  LOCAL  DEFAULT  UND
     1: 0000000000000000     0 FILE    LOCAL  DEFAULT  ABS a.cpp
    ......
     9: 0000000000000000     4 OBJECT  GLOBAL DEFAULT    4 a
    10: 0000000000000000    45 FUNC    GLOBAL DEFAULT    1 _Z3foov
    11: 0000000000000000     0 NOTYPE  GLOBAL DEFAULT  UND printf
```

可以发现，foo 函数在 c++ 中的mangling与 c 中是有很大区别的。而符号 a 是一个全局强符号。在 c++ 中，认为未初始化的全局变量，默认初始化为 0，而不是像 c 中以弱符号的形式进行处理。所以，这种情况在 C++ 中编译链接时，会出现 redefine 的错误。

但是，如果将 a.cpp 中的 a 的声明加上 extern

```c++
extern int a;
```

这样结果就不一样了。可以看先这个时候 a.cpp.o 的符号

```shell
# readelf -sW a.cpp.o
Symbol table '.symtab' contains 17 entries:
   Num:    Value          Size Type    Bind   Vis      Ndx Name
     0: 0000000000000000     0 NOTYPE  LOCAL  DEFAULT  UND
     1: 0000000000000000     0 FILE    LOCAL  DEFAULT  ABS a.cpp
   ......
    14: 0000000000000000    45 FUNC    GLOBAL DEFAULT    1 _Z3foov
    15: 0000000000000000     0 NOTYPE  GLOBAL DEFAULT  UND a
    16: 0000000000000000     0 NOTYPE  GLOBAL DEFAULT  UND printf
```

因为是 extern 的声明，此时 a 是一个 UND 的符号，链接器认为 a 的实际定义是在其他的模块中。这样就不会出现 redefine 的问题了。而 NOTYPE 表示在当前文件的符号表中没有特定类型与 a 关联。实际上，链接器本身也是不支持符号的类型的，变量类型对于链接器来说是透明的，它只需要知道符号的名字即可。

## 总结

c 中对未初始化的全局变量以弱符号进行处理，在单个编译单元中编译成目标文件时符号类型为 COMMON，这样多个弱符号链接时，链接器会选择 size 最大的那个同名符号的类型为最终该符号的类型。

而在 c++ 中，未初始化的全局变量默认是初始化为 0 的变量，保存在 BSS 段，不作为弱符号进行处理。而使用 extern 声明时，在编译单元中，会认为是一个 UND 的符号，在其他 translation unit (TU) 中进行了声明。

当出现两个及以上的同名强符号时，链接器就会发出 redefine 的告警。
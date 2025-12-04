# 系统调用和库函数的区别
相信大家在面试或者刷面试题的时候经常能看到这样的问题，“简述一下系统调用和库函数的区别”。

系统调用是操作系统提供给用户的接口，能让用户空间的程序有入口访问内核。而库函数数一组标准函数，比如复合 POSIX 或者 sysv 标准的函数。
在 linux 内核中，系统调用是专门提供给用户态程序调用的接口，内核通常是不会主动调用这些函数的。而不同操作系统中系统调用的实现都不相同。
库函数遵循标准，主要是为了考虑移植性问题。同时，库函数大多都有缓存机制，且有些库函数会调用系统调用来实现。我们看下 《Expert C Programming》 一书中的教科书式的回答。

| 库函数 | 系统调用 |
| --- | --- |
| 所有的 ANSI C 编译器版本中，C 函数库都是相同的 | 各个操作系统的系统调用是不同的 |
| 它调用函数库中的一个程序 | 它调用系统内核的服务 |
| 在用户地址空间执行 | 在内核地址空间执行 |
| 它的运行时间属于 ”用户“时间 | 它的运行时间属于 ”系统“时间 |
| 属于过程调用，开销较小 | 需要切换到内核上下文环境中然后再切换回来，开销较大 |
| 在 C 函数库libc中有大约300多个程序 | 在 UNIX 中大约有 90 个系统调用(MS-DOS 中少一些) |
| 记录与 UNIX OS man page 的第二节 | 记录与 UNIX OS man page 的第三节 |
| 典型的 C 函数库调用：fopen, system, fprintf | 典型的系统调用：open, chdir, write, fork, brk |

库函数调用通常比行内展开的代码慢(可以理解成内联)， 这是因为存在函数调用开销。但是系统调用需要从用户态切换到内核态，再切换回用户态的过程，会比库函数调用还慢。
> 特别需要注意一点，system 是库函数而不是系统调用。

以上列出的这个区别，应该是很完善的答案了，如果在面试环节遇到这个问题，这么回答肯定是不错的。那么，通常我们在 linux 系统中看到的 manpage 的 第 2 章节，就是系统调用的介绍，第三章节就是库函数的介绍，那么分别调用这两个章节的函数的话，比如
```
int open(const char *pathname, int flags);
FILE *fopen(const char *path, const char *mode);
```
那编译器在编译的时候是如何处理的呢？系统调用是操作系统提供的接口的话，编译器在编译的时候需要链接吗？

我们来浅浅的分析一下。

# 实例解析
我们来看一个简单的 c 代码的例子
```c
#include <stdio.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>

#define FILENAME "test.txt"

void test_system_call() {
  int fd = open(FILENAME, O_RDWR);
  close(fd);
}

void test_standard_libs() {
  FILE* fp = fopen(FILENAME, "rw");
  fclose(fp);
}

int main(int argc, char *argv[])
{
  test_system_call();
  test_standard_libs();
  return 0;
}
```
上面这个程序，分别调用了系统调用 open 和标准库函数 fopen。可以通过 man 2 open 和 man 3 fopen 看下这两个函数的详细介绍。我们先看下 `man man` 中对章节的介绍。
```
DESCRIPTION
       man is the system's manual pager.  Each page argument given to man is normally the name of a program, utility or function.  The manual page asso‐
       ciated  with  each  of  these arguments is then found and displayed.  A section, if provided, will direct man to look only in that section of the
       manual.  The default action is to search in all of the available sections following a pre-defined order ("1 n l 8 3 2 3posix 3pm 3perl 5 4 9 6 7"
       by  default,  unless  overridden  by the SECTION directive in /etc/manpath.config), and to show only the first page found, even if page exists in
       several sections.

       The table below shows the section numbers of the manual followed by the types of pages they contain.

       1   Executable programs or shell commands
       2   System calls (functions provided by the kernel)
       3   Library calls (functions within program libraries)
       4   Special files (usually found in /dev)
       5   File formats and conventions eg /etc/passwd
       6   Games
       7   Miscellaneous (including macro packages and conventions), e.g. man(7), groff(7)
       8   System administration commands (usually only for root)
       9   Kernel routines [Non standard]
```
可以看到，第二章节就是系统调用，第三章节就是库函数。

使用 gcc 进行编译，使用 debug 模式
```shell
gcc -g test.c -o test
```
用 readelf 看下符号
```shell
$ readelf -sW test
Symbol table '.dynsym' contains 7 entries:
   Num:    Value          Size Type    Bind   Vis      Ndx Name
     0: 0000000000000000     0 NOTYPE  LOCAL  DEFAULT  UND
     1: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND fclose@GLIBC_2.2.5 (2)
     2: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND close@GLIBC_2.2.5 (2)
     3: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND __libc_start_main@GLIBC_2.2.5 (2)
     4: 0000000000000000     0 NOTYPE  WEAK   DEFAULT  UND __gmon_start__
     5: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND open@GLIBC_2.2.5 (2)
     6: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND fopen@GLIBC_2.2.5 (2)
......
```
结果是不是跟想象中的有点不太一样。我们发现，无论是 fopen 还是 open 都是 GLIBC 的符号。也就是说，这里所谓的系统调用 open 函数，其实仅仅是 libc 中的一个函数定义。

换句话说，manpage 中的第二章节，是一个系统调用的描述，封装了对kernel系统调用的接口。
> The section describes all of the system calls(requests for kernel to perform operations).

而编译后的二进制文件 test 也仅仅依赖 libc.so 库
```shell
$ readelf -dW test | grep NEEDED
 0x0000000000000001 (NEEDED)             Shared library: [libc.so.6]
```

从这里可以看出，编译器在编译时，只需要知道 open 或者 fopen 的头文件，这些头文件是 glibc 提供的。在链接器链接时，这些函数实际的定义都是在 libc.so 中，通过共享库的链接方式进行链接，这些符号都是动态符号，需要进行地址重定位的，而跟kernel没什么关系。

那么 libc 中的描述的系统调用到底是什么呢，我们来看下 open 这个系统调用。

# open 在 libc 中的实现
在 `sysdeps/unix/sysv/linux/open.c` 有如下实现
```c
/* Open FILE with access OFLAG.  If O_CREAT or O_TMPFILE is in OFLAG,
   a third argument is the file protection.  */
int
__libc_open (const char *file, int oflag, ...)
{
  int mode = 0;

  if (__OPEN_NEEDS_MODE (oflag))
    {
      va_list arg;
      va_start (arg, oflag);
      mode = va_arg (arg, int);
      va_end (arg);
    }

  return SYSCALL_CANCEL (openat, AT_FDCWD, file, oflag, mode);
}

weak_alias (__libc_open, open)
```
weak_alias 是一个宏，用于创建弱符号别名。这里是将 `__libc_open` 这个符号创建为 open 的弱别名。也就是说，如果其他模块提供了 open 的实现，那么在链接时，链接器会使用该版本的 open 实现而不是 `__libc_open`。

在 `__libc_open` 中，调用了宏 `SYSCALL_CANCEL`，该宏在 `sysdeps/unix/sysdep.h` 中进行了定义。
```c
#define SYSCALL_CANCEL(...) \
  ({									     \
    long int sc_ret;							     \
    if (NO_SYSCALL_CANCEL_CHECKING)					     \
      sc_ret = INLINE_SYSCALL_CALL (__VA_ARGS__); 			     \
    else								     \
      {									     \
	int sc_cancel_oldtype = LIBC_CANCEL_ASYNC ();			     \
	sc_ret = INLINE_SYSCALL_CALL (__VA_ARGS__);			     \
        LIBC_CANCEL_RESET (sc_cancel_oldtype);				     \
      }									     \
    sc_ret;								     \
  })

```
核心调用就是 INLINE_SYSCALL_CALL，我用来分析下 open 这个实现中整个宏展开的一个过程。
```c
INLINE_SYSCALL_CALL (__VA_ARGS)
==> INLINE_SYSCALL_CALL(openat, AT_FDCWD, file, oflag, mode)
```
这些宏定义在 `sysdeps/unix/sysdep.h` 中可以找到，
```c
INLINE_SYSCALL_CALL (openat, AT_FDCWD, file, oflag, mode)
==> __INLINE_SYSCALL_DISP (__INLINE_SYSCALL, openat, AT_FDCWD, file, oflag, mode)
==> __SYSCALL_CONCAT (__INLINE_SYSCALL, __INLINE_SYSCALL_NARGS(openat, AT_FDCWD, file, oflag, mode))(openat, AT_FDCWD, file, oflag, mode)
```
来分析一下 `__INLINE_SYSCALL_NARGS` 这个宏
```c
#define __INLINE_SYSCALL_NARGS_X(a,b,c,d,e,f,g,h,n,...) n
#define __INLINE_SYSCALL_NARGS(...) \
  __INLINE_SYSCALL_NARGS_X (__VA_ARGS__,7,6,5,4,3,2,1,0,)
```
这个宏的作用是计算参数的个数，数字和字母参数就是占位符的作用。把上面的宏展开就是
```c
__INLINE_SYSCALL_NARGS(openat, AT_FDCWD, file, oflag, mode)
==> __INLINE_SYSCALL_NARGS_X (openat, AT_FDCWD, file, oflag, mode,7,6,5,4,3,2,1,0,)
```
参数对应关系如下所示
```
a -> openat
b -> AT_FDCWD
c -> file
d -> oflag
e -> mode
f -> 7
g -> 6
h -> 5
n -> 4
```
n 就是最终结果，为 4。所以上面的宏继续展开就是
```c
__SYSCALL_CONCAT (__INLINE_SYSCALL, __INLINE_SYSCALL_NARGS(openat, AT_FDCWD, file, oflag, mode))(openat, AT_FDCWD, file, oflag, mode)
==> __SYSCALL_CONCAT (__INLINE_SYSCALL, 4)(openat, AT_FDCWD, file, oflag, mode)
==> __INLINE_SYSCALL4 (openat, AT_FDCWD, file, oflag, mode)
==> INLINE_SYSCALL (openat, 4, AT_FDCWD, file, oflag, mode)
```
在 `sysdeps/unix/sysv/sysdep.h` 中可以找到
```c
/* Define a macro which expands into the inline wrapper code for a system
   call.  It sets the errno and returns -1 on a failure, or the syscall
   return value otherwise.  */
#undef INLINE_SYSCALL
#define INLINE_SYSCALL(name, nr, args...)				\
  ({									\
    long int sc_ret = INTERNAL_SYSCALL (name, nr, args);		\
    __glibc_unlikely (INTERNAL_SYSCALL_ERROR_P (sc_ret))		\
    ? SYSCALL_ERROR_LABEL (INTERNAL_SYSCALL_ERRNO (sc_ret))		\
    : sc_ret;								\
  })
```
INLINE_SYSCALL 也是一个封装的宏函数，关键调用的是 `INTERNAL_SYSCALL` 这个宏函数。我们看下 arm 架构下这个宏的实现。在 `sysdeps/unix/sysv/linux/arm/sysdep.h` 中
```c
#define INTERNAL_SYSCALL(name, nr, args...)			\
	INTERNAL_SYSCALL_RAW(SYS_ify(name), nr, args)
```
具体实现就在 `INTERNAL_SYSCALL_RAW` 这个宏函数中了。
![internal_syscall](image/internal_syscall.png)

可以看到，libc 中的实现，实际调用的是 syscall 汇编指令。

通过 `man syscall` 可以查看下简介系统调用的描述
```
Architecture calling conventions
       Every  architecture has its own way of invoking and passing arguments to the kernel.  The details for various architectures are listed in the two
       tables below.

       The first table lists the instruction used to transition to kernel mode, (which might not be the fastest or best way to transition to the kernel,
       so  you  might  have  to refer to vdso(7)), the register used to indicate the system call number, and the register used to return the system call
       result.

       arch/ABI   instruction          syscall #   retval Notes
       ───────────────────────────────────────────────────────────────────
       arm/OABI   swi NR               -           a1     NR is syscall #
       arm/EABI   swi 0x0              r7          r0

       arm64      svc #0               x8          x0
       blackfin   excpt 0x0            P0          R0
       i386       int $0x80            eax         eax
       ia64       break 0x100000       r15         r8     See below
       mips       syscall              v0          v0     See below
       parisc     ble 0x100(%sr2, %r0) r20         r28
       s390       svc 0                r1          r2     See below
       s390x      svc 0                r1          r2     See below
       sparc/32   t 0x10               g1          o0
       sparc/64   t 0x6d               g1          o0
       x86_64     syscall              rax         rax    See below
       x32        syscall              rax         rax    See below
```
这张表列出了不同系统传递给kernel的指令。在 arm/EABI 架构中，就是 `swi 0x0`，这与上面这个内嵌汇编中的调用是一样的。而在 arm 汇编中，`@ syscall` 表示注释，说明这是一条系统调用的指令。而第二张表，描述了不同架构传递给系统调用的参数所使用的寄存器。
```
 The second table shows the registers used to pass the system call arguments.

       arch/ABI      arg1  arg2  arg3  arg4  arg5  arg6  arg7  Notes
       ──────────────────────────────────────────────────────────────────
       arm/OABI      a1    a2    a3    a4    v1    v2    v3
       arm/EABI      r0    r1    r2    r3    r4    r5    r6
       arm64         x0    x1    x2    x3    x4    x5    -
       blackfin      R0    R1    R2    R3    R4    R5    -
       i386          ebx   ecx   edx   esi   edi   ebp   -
       ia64          out0  out1  out2  out3  out4  out5  -
       mips/o32      a0    a1    a2    a3    -     -     -     See below
       mips/n32,64   a0    a1    a2    a3    a4    a5    -
       parisc        r26   r25   r24   r23   r22   r21   -
       s390          r2    r3    r4    r5    r6    r7    -
       s390x         r2    r3    r4    r5    r6    r7    -
       sparc/32      o0    o1    o2    o3    o4    o5    -
       sparc/64      o0    o1    o2    o3    o4    o5    -
       x86_64        rdi   rsi   rdx   r10   r8    r9    -
       x32           rdi   rsi   rdx   r10   r8    r9    -
```
我们关注 `arm/EABI` 架构，可以使用 7 个参数，分别对应 r0 - r6 一共 7 个寄存器。来分析下上图中的代码。_a1 对应寄存器 r0，而 _nr 表示系统调用号，对应寄存器 r7。这个系统调用号是什么意思呢？

在分析上面的宏展开时，最终调用的是
```c
INTERNAL_SYSCALL_RAW(SYS_ify(name), nr, args)
```
而
```c
_nr = name;
```
这个 name 就是 `SYS_ify(name)` 的值，而 `SYS_ify` 这个宏定义为
```c
#define SYS_ify(syscall_name) (__NR_##syscall_name)
```
展开就是 `__NR_openat`，这个就是系统调用号，在 linux 系统头文件 `asm-generic/unistd.h` 中定义
```c
#define __NR_openat 56
```
回到上面的问题。其余参数的传递就是通过
```c
LOAD_ARGS_##nr (args)
ASM_ARGS_##_nr
```
来实现的，这里的 nr 的值是 4，可以从上面的宏展开分析得知。
```c
ASM_ARGS_4 展开
==> ASM_ARGS_3, "r" (_a4)
==> ASM_ARGS_2, "r" (_a3), "r" (_a4)
==> ASM_ARGS_1, "r" (_a2), "r" (_a3), "r" (_a4)
==> ASM_ARGS_0, "r" (_a1), "r" (_a2), "r" (_a3), "r" (_a4)
==> , "r" (_a1), "r" (_a2), "r" (_a3), "r" (_a4)
```
这样，open 这个系统调用，使用 `swi 0x0` 指令，输出到 r0 寄存器对应的变量 `_a1` 中，_nr 对应寄存器 a7 为系统调用号，其余输入参数 _a1 - _a4 对应寄存器 r1 - r4。当调用 `swi 0x0` 指令时，会触发一个软中断，cpu 会暂停当前程序的执行，而跳转到 kernel 中去执行这个中断处理函数，执行相应的操作。

# 总结
我们通常使用的系统调用，在 manpage 第二章节所描述的函数，其实是 libc 中封装的函数，这个函数就是对应系统调用的描述，以一个 c 函数的形式提供给用户使用。而实际的实现，是在 libc 中根据特定架构提供的指令以汇编的形式实现的。比如上面分析的系统调用 open，是通过 `swi 0x0` 这个软中断来触发的，而系统调用号以及软中断的处理过程，是在 kernel 中实现的。

这就可以解释上面那个 test 程序了。编译器在实际编译的时候，不管是库函数 fopen 还是系统调用 open 都是当做一个外部函数符号来处理的。在链接器进行链接的时候，在 libc.so 中找到了函数定义并链接。而程序运行时，动态链接器加载 libc.so 并对 open 和 fopen 进行地址重定位，当执行 open 或者 fopen 时跳转到 libc.so 中对应的函数处执行。

今天的分享就到这里，我是[猫步旅人](http://blog.wuzhenyu.com.cn/about.html)，一个对 kernel 和编译器感兴趣的程序员。
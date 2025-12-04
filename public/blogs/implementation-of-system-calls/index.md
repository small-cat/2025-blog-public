你好，我是[猫步旅人](/about)，一名热爱编程，对 kernel，编译器感兴趣的程序员。

接着上一讲[你所不知道的关于库函数和系统调用的那些事](/blog/something-about-library-functions-and-system-calls)。在 libc 的实现中，arm64 中的实现是通过 `swi 0x0` 指令触发软中断来陷入内核进行处理的。r7 寄存器保存的是传递给内核的系统调用号，告诉内核处理的是什么系统调用，而 r0 - r6 寄存器用来传递参数。

那么当触发软中断后，程序从用户态切换到内核态的时候，做了什么事情呢。今天我们来继续分析一下，关于 open 系统调用的那些事。

# 系统调用的流程
在 libc 中系统调用的实现，最终是封装了一个宏函数
![syscall in libc](/images/blog/internal_syscall.png)

INTERNAL_SYSCAL_RAW 中内嵌了一段汇编代码。如果以 open 系统调用来看，就是
```c
INTERNAL_SYSCALL_RAW(__NR_openat, 4, AT_FDCWD, file, oflag, mode)
```
__nr 中保存的就是系统调用号，看下 kernel 中 arm64 的系统调用号的定义
```c
#define __NR_openat 322
__SYSCALL(__NR_openat, sys_openat)
```
而此时 `__SYSCALL` 宏函数的定义为
```c
#define __SYSCALL(nr, sym) asmlinkage long __arm64_##sym(const struct pt_regs *regs);
```
宏展开就是申明了一个函数，函数原型为
```c
#define __SYSCALL(nr, sym)	asmlinkage long __arm64_##sym(const struct pt_regs *);
```
这是宏展开的第一步，接着第二步，继续使用 `__SYSCALL` 的另一个宏定义继续展开
```c
#undef __SYSCALL
#define __SYSCALL(nr, sym)	[nr] = __arm64_##sym,

const syscall_fn_t sys_call_table[__NR_syscalls] = {
	[0 ... __NR_syscalls - 1] = __arm64_sys_ni_syscall,
#include <asm/unistd.h>
```
使用 undef 删除原先的 `__SYSCALL` 的定义，然后使用一个新的定义，同时重新 include 了头文件，即相当于使用新的宏函数定义重新将头文件中的宏进行一次新的替换展开。

这次展开，是为了定义数组，初始化 `sys_call_table` 数组的成员，openat 就是
```
sys_call_table[__NR_openat] = __arm64_sys_openat,
```
这样，当调用 open 系统调用时，就会在  sys_call_table 中根据系统调用号找到对应的函数指针，调用该函数指针即可。
![syscall open](/images/blog/syscall-open.png)



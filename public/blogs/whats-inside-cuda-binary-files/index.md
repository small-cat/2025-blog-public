# cuda 混合编译

大家好。今天我们来讨论一下，相比gcc编译器编译的二进制elf文件，包含有 cuda kernel 的源文件编译出来的 elf 文件有什么不同呢？

之前研究过一点 tvm。从 BYOC 的框架中可以得知，前端将模型 partition 成 host 和 accel(accel 表示后端，比如加速卡，NPU或者其他AI加速模块) 两部分，对 accel 部分，会切分成多个 regions，对应到多个子图，这部分每一个 regions 会被封装成一个独立的 function 进行处理，这些 function 都带有 annotation，附带硬件相关的标签信息，能知道由哪个 accel 后端来处理，在 host 侧对这些函数的处理，仅仅是简单的封装成对一个外部函数的调用，而实际的编译是由 accel-specific 的编译器来编译和 codegen 的。而每一个 sub-graph 会编译成一个 sub-module，最终与 host sub-module 一起封装成一个 heterogenous blob。



而 nvcc 应该也是类似的道理。

在 《Cuda Compiler Driver NVCC.pdf》中，有这么一段介绍

> *Dispatching GPU jobs by the host process is supported by the CUDA Toolkit in the form*
> 
> *of remote procedure calling. The GPU code is implemented as a collection of functions*
> 
> *in a language that is essentially C, but with some annotations for distinguishing them*
> 
> *from the host code, plus annotations for distinguishing different types of data memory*
> 
> *that exists on the GPU. Such functions may have parameters, and they can be called*
> 
> *using a syntax that is very similar to regular C function calling, but slightly extended for*
> 
> *being able to specify the matrix of GPU threads that must execute the called function.*
> 
> *During its life time, the host process may dispatch many parallel GPU tasks.*

大致意思就是说，CUDA ToolKit 可以支持主机端程序通过 RPC 的方式调度 GPU 任务。GPU 代码与 C 代码类似，但是带有一些额外的 annotations 信息来做区分。而GPU 代码实现的函数的调用也与传统 c 函数调用相同。

直接来编译一个 helloword 程序

```c
/*
*hello_world.cu
*/
#include<stdio.h>
__global__ void hello_world(void)
{
  printf("GPU: Hello world!\n");
}
int main(int argc,char **argv)
{
  printf("CPU: Hello world!\n");
  hello_world<<<1,10>>>();
  cudaDeviceReset();//if no this line ,it can not output hello world from gpu
  return 0;
}
```

编译

```shell
nvcc --cudart shared -o device helloworld.cu --verbose
```

使用 --cudart shared 而不使用静态链接的方式，是为了不将 libcudart.a 链接到二进制文件中，使得目标程序大小偏大。

```shell
objdump -ds device
```

观察 hello_world 函数

![](/images/blog/cuda/1.png)

可以看到，本质上是一个函数调用，对 `_Z30__device_stub__Z11hello_worldvv`函数的一个调用。

**推测：** 对 device 设备端的函数，也是封装成一个 external function 的函数调用，而该函数实际是通过 device设备端(也就是GPU) 的code gen 来生成的，最终会将其合并成一个二进制文件。而在编写 cuda 代码的过程中，所使用的这些 c++ 扩展，就类似于 annotation 的作用，注明了这属于 device 设备端的代码。



## compile process

<img src="/images/blog/cuda/2.jpg" alt="" width="505"/>

a CUDA executable can exist in two forms:

- a binary one that can only target specific devices and an intermediate assembly one that can target any device by JIT compilation.
- a PTX Assembler (ptxas) performs the compilation during execution time, adding a start-up overhead, at least during the first invocation of a kernel.

cuda 可执行文件可以有两种形式，一种是针对特定设备的二进制文件和一种中间表示的汇编形式，可以通过 JIT 的方式运行与任何设备上。JIT 也就是 Just In Time，java 虚拟机，python，v8 都有 JIT 机制。而另一种，就是 PTX 汇编，这种形式是通过 cuda runtime 在运行时加载编译然后执行的，第一次加载编译时会比较耗时。

A CUDA program can still target different devices by embedding multiple cubins into a single file (called a *fat binary*). The appropriate cubin is selected at run-time.

![](/images/blog/cuda/3.jpg)

从上面可以发现，使用nvcc进行编译，将包含有cuda kernel 的 c++ 代码，分成了 device 的代码和 host 的代码，host 代码通过 clang/gcc 以传统 c++ 代码的方式进行编译，而 device 代码以 nvcc cuda 编译的流程进行编译。我们使用 --verbose 的方式来观察一下具体的编译流程。

```shell
$ nvcc --cudart shared -o device helloworld.cu --verbose ---keep
```

![](/images/blog/cuda/4.jpg)

helloworld.cu 编译后生成了 hellworld.cpp1.ii 和 helloworld.ptx，ptx 也就是 cuda 汇编代码。然后 helloworld.ptx 编译成了 cubin 二进制文件，而 fatbinary 最终会被嵌入到最终的 elf 二进制文件 devicde 中。

## elf 二进制文件分析

使用 readelf 观察一下 device 这个文件

```shell
readelf -a device
```

![](/images/blog/cuda/5.jpg)

在该 elf 文件中，多了两个段 .nv_fatbin 和 .nvFatBinSegment

![](/images/blog/cuda/6.jpg)

从 Program Headers 中可以发现，这两个段分别位于代码段和数据段中。

第一个 LOAD 属性为 RE，表示可读可执行表示代码段，而第二个 LOAD 属性为 RW，表示可读可写，为数据段。从上往下索引分别是 02 和 03，所以 .nv_fatbin 位于代码段，而 .nvFatBinSegment 位于数据段中。

### .nv_fatbin

It is split into an arbitrary number of distinct regions, each of which **contains one or more GPU ELF files, PTX code files, and/or cubin files**.

该段中保存的通常是 PTX 汇编代码或者 cubin 二进制代码，正好与上面的分析相符，位于代码段中。

### .nvFatBinSegment

**It contains metadata about the .nv_fatbin section**, such as the starting addresses of its regions. Its size is a multiple of six words (24 bytes), where the third word in each group of six is an address inside of the .nv_fatbin section. If we modify the .nv_fatbin, then these addresses need to be changed to match it.

该段保存的是 .nv_fatbin 的一些 metadata。

### 文件分析

先来看下 device 文件头的信息，可以通过 readelf -h 的方式查看

![](/images/blog/cuda/7.jpg)

文件头是 64 个字节，program headers 是 56 个字节，共有 9 个 program headers，每一个 section header 是 64 字节。

先看下 elf.h 中 Elf64_Ehdr 文件的数据结构

![](/images/blog/cuda/8.jpg)

e_ident 就是上面 readelf -h 结果中的 Magic，也就是 elf 格式的魔数。

文件头大小是 64 字节，使用 od 来分析一下。

```shell
od -Ax -tx1 -N 64 device
```

解释一下这里的参数

- -Ax: 显示地址的时候，用十六进制来表示。如果使用 -Ad，意思就是用十进制来显示地址;
- -t -x1: 显示字节码内容的时候，使用十六进制(x)，每次显示一个字节(1);
- -N 64：只需要读取 64 个字节;

![](/images/blog/cuda/9.jpg)

e_type 为 0x0003(小端)，e_type 的取值可以在 elf.h 中查看

![](/images/blog/cuda/10.jpg)

3 表示该文件是 shared object file。

而 e_machine 为 0x003e，

![](/images/blog/cuda/11.png)

从 elf.h 中可以看出，0x3e 的 10 进制为 62，也就是 ADM x86_64架构。而 cuda 的 e_machine 应该是 190，也就是 0xbe。

![](/images/blog/cuda/12.jpg)

也就是说如果是 cuda bin，Elf64_Ehdr 中 e_machine 成员的值，应该是 190，16 进制就是 0xbe。

我们在最上面分析 device 文件时，使用 readelf -a 查看，发现 .nv_fatbin 在 Section Header 中的索引是 17，section header 的起始偏移是 0x42f8 = 17144，从 elf 文件中获取 nv_fatbin 这个 section 的信息，计算偏移为 0x42f8 + 17 * 64，64 就是 e_shentsize 的大小，为 0x40，即每一个 section header item 的大小为 64 字节

![](/images/blog/cuda/13.jpg)

而 section header 的数据结构为

![](/images/blog/cuda/14.jpg)

该 section 的大小和偏移与在 readelf -S 中看到的一致，看下内容 .nvfatbin 段的内容

![](/images/blog/cuda/15.jpg)

nvcc 编译时，--keep 将临时文件保存下来，device_dlink.fatbin 与上面的内容一致

![](/images/blog/cuda/16.jpg)

fatbin 是 device-only 的代码

上面这个 fatbin 文件其实是一个包裹着 elf 文件的二进制文件，

![](/images/blog/cuda/17.jpg)

文件 e_machine 为 0xbe，就是 cuda elf 格式的文件。

## 总结

cuda 二进制文件，分成两部分，一个是 host 部分的代码，一个是 device 段的代码。device 段的代码，作为一个 section 的方式，以 fatbin 的方式或者 ptx 汇编代码的方式嵌入到了最终的 elf 文件中。这部分代码，有 cuda runtime 来负责编译运行。

# reference

1. [PCI BARs and other means of accessing the GPU](https://envytools.readthedocs.io/en/latest/hw/bus/bars.html#id1)
2. [https://www.ofweek.com/ai/2021-05/ART-201721-11000-30500304_3.html](https://www.ofweek.com/ai/2021-05/ART-201721-11000-30500304_3.html)
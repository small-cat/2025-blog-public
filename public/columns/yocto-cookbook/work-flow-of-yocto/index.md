你好，我是吴震宇。

上一节，我们了解了 yocto 的使用方法，在执行 poky 中的脚本设置好环境变量之后，使用 bitbake + target 的方式就可以进行构建了。

为什么说构建，而不是说编译，因为编译只是其中一个任务。那么，我们这一节就来看看 yocto 的构建流程吧。

## yocto 构建流程
TODO: 
- 目录结构分析
- 流程分析，log.task_list
  - bitbake 的执行环境解析, source poky 中脚本的作用，做了什么
  - bitbake 解析 recipe 中的 metadata 
  - 是如何创建 task 列表的
  - recipe 中的匿名 python code 是在什么时候执行的，这就是为什么 python 的匿名代码可以直接打印而shell 不行, 一个是在 解析 recipe 时，一个是在 task 中
  - 为什么可以同时支持 shell 和 python
- task 介绍
  - 脚本以及对应的日志
  - task 的执行是不是拓扑排序的方式，出错时，该 task 及其后续依赖的 task 都会中断

通过上一节添加的 recipe 的构建过程，可以看到 bitbake 在构建后生成的文件都在 build 目录中。我们来看一下这个 build 的目录结构。
```
- build
  - bitbake-lock.log
  - ccache
  - ...
  - tmp
    - work
    - log
```

可以使用
```
bitbake helloworld -c tasklist
```
的方式查看该 pn 的所有的 task 列表。也可以在日志中查看。
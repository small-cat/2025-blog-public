大家好，我是吴震宇。

在刚开始接触 yocto 的时候，可能经常有同学会发出这个疑问，为什么我设置好的环境变量，在启动 bitbake 后的构建过程中没有生效呢，在 shell 中打印是生效了的，但是在构建任务中就是没有生效。

要搞清楚这个问题，需要分析清楚 bitbake 中是如何处理环境变量的。

当从 shell 中启动 bitbake 进行构建操作时，bitbake 会严格控制 shell 执行环境中继承过来的环境变量，通过 clean 操作仅仅保留一些必要的环境变量，以确保来自构建机器的环境不会对整个构建过程产生影响。

在 `poky/bitbake/lib/bb/main.py:setup_bitbake` 函数中，
```
def setup_bitbake(configParams, extrafeatures=None):
  ...
  # Clear away any spurious environment variables while we stoke up the cooker
  # (done after import_extension_module() above since for example import gi triggers env var usage)
  cleanedvars = bb.utils.clean_environment()
  ...

  # Restore the environment in case the UI needs it
  for k in cleanedvars:
    os.environ[k] = cleanedvars[k]
  
  ...
```
bitbake 调用 `bb.utils.clean_environment()` 清理环境变量，在执行结束后，再将清理的变量恢复。
```
def approved_variables():
    """
    Determine and return the list of variables which are approved
    to remain in the environment.
    """
    if 'BB_PRESERVE_ENV' in os.environ:
        return os.environ.keys()
    approved = []
    if 'BB_ENV_PASSTHROUGH' in os.environ:
        approved = os.environ['BB_ENV_PASSTHROUGH'].split()
        approved.extend(['BB_ENV_PASSTHROUGH'])
    else:
        approved = preserved_envvars()
    if 'BB_ENV_PASSTHROUGH_ADDITIONS' in os.environ:
        approved.extend(os.environ['BB_ENV_PASSTHROUGH_ADDITIONS'].split())
        if 'BB_ENV_PASSTHROUGH_ADDITIONS' not in approved:
            approved.extend(['BB_ENV_PASSTHROUGH_ADDITIONS'])
    return approved

def clean_environment():
    """
    Clean up any spurious environment variables. This will remove any
    variables the user hasn't chosen to preserve.
    """
    if 'BB_PRESERVE_ENV' not in os.environ:
        good_vars = approved_variables()
        return filter_environment(good_vars)

    return {}
```
clean_environment 函数会根据环境变量 `BB_PRESERVE_ENV` 进行判断，如果没有设置，则会保留一些必要的环境变量，如果设置了，则会保留用户设置的环境变量。

而 approved_variables 函数，返回的就是需要保留的环境变量。保留的环境变量，可以通过 `BB_ENV_PASSTHROUGH` 和 `BB_ENV_PASSTHROUGH_ADDITIONS` 两个环境变量进行设置。

filter_environment 函数，会将环境变量中除了 good_vars 以外的环境变量都删除。

也就是说，bitbake 在启动时，首先会清理环境变量，仅保留一些必要的环境变量，比如
- BB_TASKHASH
- HOME
- LOGNAME
- PATH
- PWD
- SHELL
- USER
- LC_ALL
- BBSERVER
- BBPATH
- BB_PRESERVE_ENV
- BB_ENV_PASSTHROUGH
- BB_ENV_PASSTHROUGH_ADDITIONS

如果想要在 bitbake 中保留完整的 shell 工作环境，设置 
```
export BB_PRESERVE_ENV=1
```
如果需要保留部分环境变量，可以通过设置 `BB_ENV_PASSTHROUGH` 和 `BB_ENV_PASSTHROUGH_ADDITIONS` 两个环境变量。
```
export BB_ENV_PASSTHROUGH_ADDITIONS="$BB_ENV_PASSTHROUGH_ADDITIONS CCACHE_DIR"
```
上面这个例子，告诉 bitbake 保留 CCACHE_DIR 这个环境变量，使得编译任务在编译使用 ccache 时，不访问默认的 `$HOME/.ccache` 目录，而访问 CCACHE_DIR 变量指定的路径。

如果想要 bitbake 为运行的 task 生成的脚本中 export 环境变量，比如 CCACHE_DIR，可以在 local.conf 中将该变量 export，相当于设置了 export 的 flag
```
export CCACHE_DIR
```
这样，比如在 `run.do_compile` 脚本中，就会自动 export CCACHE_DIR 这个环境变量。

## 内容小结
bitbake 在启动时，首先会清理环境变量，仅保留一些必要的环境变量，这样做是为了防止 shell 运行时环境对构建过程产生影响。

bitbake 中提供了几个变量，可以用来保留 shell 运行时的环境变量。
- BB_PRESERVE_ENV
- BB_ENV_PASSTHROUGH
- BB_ENV_PASSTHROUGH_ADDITIONS

举一个简单的例子，当我们使用外部工具链 gcc 进行编译构建时。如果运行 binutils 需要依赖动态库，那么在运行阶段就需要设置 LD_LIBRARY_PATH 这个环境变量。在 shell 环境中设置的该变量会被 bitbake 清理掉，所以设置 `BB_PRESERVE_ENV=1` bitbake 就会保留环境变量 LD_LIBRARY_PATH，这样 bitbake 在调用 gcc 进行编译时 binutils 就能被正常调用运行了。

## reference
1. https://docs.yoctoproject.org/bitbake/2.6/bitbake-user-manual/bitbake-user-manual-metadata.html#passing-information-into-the-build-task-environment
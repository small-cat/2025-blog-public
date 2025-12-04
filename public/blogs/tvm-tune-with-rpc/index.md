## 编译 tvm
使用交叉工具链，交叉编译 tvm_runtime 和 tvm_rpc。在车机环境中，是没有 python 环境的，需要使用 tvm_rpc 二进制文件的方式运行
### 交叉编译 tvm
```
mkdir build-cross-compile
cd build-cross-compile
cp ../cmake/config.cmake .
```
打开 config.cmake 中的 USE_CPP_RPC 开关，并关闭 libbacktrace 库的使用
```
set(USE_CPP_RPC ON)
set(USE_LIBBACKTRACE OFF)
```
这是因为 libbacktrace 库是通过 autoconf 来编译的，tvm 中 cmake 传递给 configure 的参数，使用交叉工具链的这种方式存在问题，需要做修改。

设置交叉编译工具链
```
GCC_TOOLCHAIN_PATH="/home/wzy376152/source_code/aarch64-oe-linux-9.3-glibc-2.31"
TOOLCHAIN_PREFIX="aarch64-oe-linux"

export CC=${GCC_TOOLCHAIN_PATH}/x86_64-oesdk-linux/usr/bin/${TOOLCHAIN_PREFIX}/${TOOLCHAIN_PREFIX}-gcc
export CXX=${GCC_TOOLCHAIN_PATH}/x86_64-oesdk-linux/usr/bin/${TOOLCHAIN_PREFIX}/${TOOLCHAIN_PREFIX}-g++
export SYSROOT=${GCC_TOOLCHAIN_PATH}/sysroots/aarch64-oe-linux
# cp cmake/config.cmake build_rcar
# cd build_rcar
cmake -DCMAKE_CXX_COMPILER=$CXX  -DCMAKE_C_COMPILER=$CC -DCMAKE_SYSROOT=$SYSROOT ..
make runtime -j16
make tvm_rpc -j16
```
编译结果为
```
libtvm_runtime.so
tvm_rpc
```
### host 编译 tvm
todo

## 准备 host python 环境
首先使用 pip --version 查看默认的 pip 关联的 python 版本是哪个，如果是 python2.7 版本，且有 python3 版本的话，使用 python3。
```
python3.6 -m pip -i https://pypi.douban.com/simple virtualenv virtualenvwrapper
```
如果默认是 python3 直接安装
```
pip install -i https://pypi.douban.com/simple virtualenv virtualenvwrapper
```
安装成功后，linux 环境，在 home 目录的 .local/bin 中会存在 virtualenv 和 virtualenvwrapper.sh 脚本

设置一下 virtualenvwrapper.sh 启动时使用的 python 环境，可以通过如下环境变量进行设置
```
export VIRTUALENVWRAPPER_PYTHON=/usr/bin/python3.6 # 这里必须与安装 virtualenv 时保持一致，否则会出错
export WORKNON_HOME=.virtualenv # 设置虚拟环境安装路径
```
然后
```
source .local/bin/virtualenvwrapper.sh
mkvirtualenv -p /usr/bin/python3.8 tvm
```
-p 后面的参数版本可以是当前机器上安装的任意python版本，tvm 就是当前虚拟环境的名称，会安装到 $WORKON_HOME 中

后面，就可以直接使用该虚拟环境了
```
source $WORKON_HOME/tvm/bin/activate # 进入
deactivate # 退出
```
然后安装如下需要的 python libs 
```
tornado
numpy
decorator
xgboost # 如果tuned的过程中，出现 xgboost 的错误，将 xgboost 版本回退到 1.5
pytest
cloudpickle
```
回退的话
```
# uninstall
pip uninstall xgboost
# install
pip install xgboost==1.5 # 指定版本
```

## 创建 rpc_tracker 和 rpc_server
在 host 机器上，创建 rpc tracker，
```
python -m tvm.exec.rpc_tracker --host=0.0.0.0 --port=9190
```
将远程 device 的机器作为 remote server，并注册到 host 的 rpc tracker 上。
1. 如果 device 机器是linux 服务器，首先在 remote server 上，编译好 tvm runtime
```
make runtime -j8
```
然后配置环境变量
```
export PYTHONPATH=$PYTHONPATH:$HOME/wuzhenyu/tvm/python
```
配置生效之后，启动 tvm 虚拟环境，然后注册 device 到 rpc tracker
```
python -m tvm.exec.rpc_server --tracker=127.0.0.1:9190 --key=rk3399
```
注册成功后，在 host 上可以查询一下
```
python -m tvm.exec.query_rpc_tracker --host=0.0.0.0 --port=9190
```

2. 如果 device 是车机环境，没有 python 环境，需要将之前交叉编译的产物 push 到车机上。
```
# 将文件 push 到车机上的 /tmp 目录中
adb -host -s xxx libtvm_runtime.so /tmp
adb -host -s xxx tvm_rpc /tmp
```
车机环境中，库一般都是在 /usr/lib64 中，所以链接时，可以先将库 copy 到这，也可以通过设置 LD_LIBRARY_PATH 的方法，前提是 /usr/lib64 中没有 libtvm_runtime.so 这个文件

方式1：<br>
```
/tmp/tvm_rpc server --host=0.0.0.0 --tracker=127.0.0.1:9190 --key=sa8155
```
ip 地址为 host 的地址，这种方式与 device 服务器环境相同

方式2： <br>
```
/tmp/tvm_rpc server --host=0.0.0.0 --tracker=127.0.0.1:9190 --key=sa8155
```
这种方式，ip 地址设置的是 localhost，当车机与服务器通过 usb 连接时，可以通过 adb reverse 的方式，将车机的 ip和端口映射到 host 上。
```
import os

def remote_usb_setup(device_ids, tracker_port):
    assert len(device_ids) == 1, "Currently only 1 usb device is supported."
    for device_id in device_ids:
        print('device_id', device_id)
        cmd_str = 'adb -host -s ' + device_id + ' reverse tcp:' + \
            str(tracker_port) + ' tcp:' + str(tracker_port)
        exit_code = os.system(cmd_str)
        if exit_code:
            raise Exception('adb -host -s ' + device_id +
                            ' reverse port %s failed.' % tracker_port)
        cmd_str = 'adb -host -s ' + device_id + ' reverse --list'
        exit_code = os.system(cmd_str)
        ### For RPC Server
        # Device：pc monitoring port 9090, redirect to device's 9090 port
        cmd_str = 'adb -host -s ' + device_id + ' forward tcp:9090 tcp:9090'
        exit_code = os.system(cmd_str)
        if exit_code:
            raise Exception('adb -host forward port 9090 failed.')
        cmd_str = 'adb -host -s ' + device_id + ' forward --list'
        exit_code = os.system(cmd_str)

tracker_port = 9190  # tracker port 是前面两条命令里面使用的 port
device_id = ["34045edf97b24700"]  # 可以通过 adb -host devices 查看
remote_usb_setup(device_id, tracker_port)
```
这样，rpc server 和 rpc tracker 就连接起来了。

**adb reverse tcp:8081 tcp:8081
这条命令的意思是，Android允许我们通过ADB，把Android上的某个端口映射到电脑（adb forward），或者把电脑的某个端口映射到Android系统（adb reverse），在这里假设电脑上开启的服务，监听的端口为8081。Android手机通过USB连接电脑后，在终端直接执行adb reverse tcp:8081 tcp:8081，然后在手机中访问127.0.0.1:8081，就可以访问到电脑上启动的服务了。<br>
1.必须是在连接数据线usb的前提下才能使用该方案进行代码调试。**

连接成功之后，可以在 host 查询
```
python -m tvm.exec.query_rpc_tracker --host=0.0.0.0 --port=9060
```

## tune
### 代码说明
```
def ansor_tune_and_evaluate(mod, params, target, export_lib, use_ndk):
  log_file = "ar_navigate_8155_ansor_tuned.log"

	# 切分子图，每一个 subgraph 对应一个 task，寻找最优优化
	# 在 tuning 的过程中，task 的tuning是顺序执行的
	# task_weights 会影响 task_schedule 对该task执行 iterate 过程中的时间资源的分配
  print("Extract tasks...")
  tasks, tasks_weights = auto_scheduler.extract_tasks(mod["main"], target=target, params=params)

  for idx, task in enumerate(tasks):
    print("=========== Task %2d/%2d (workload key: %s) ===========" % (idx, len(tasks), task.workload_key))
    print(task.compute_dag)

  print("Begin Ansor tuning...")
	# 如果已经tune了一部分，可以接着上一次的结果继续tune
  # tuner = auto_scheduler.TaskScheduler(tasks, tasks_weights, load_log_file=log_file)
  tuner = auto_scheduler.TaskScheduler(tasks, tasks_weights)

	# 对于交叉编译，需要设置交叉编译工具链，task schedule 出来的子图编译后才能部署到device上运行
  if use_ndk:
    os.environ["TVM_NDK_CC"] = "/home/wzy376152/qcom_sa8155_toolchain/bin/aarch64-oe-linux-g++"
    ndk_options = [
      "--sysroot=/home/wzy376152/qcom_sa8155_toolchain/sysroots/aarch64-oe-linux",
      "-shared",
      "-fPIC",
    ]
    build_func = cc.cross_compiler(ndk.create_shared, options=ndk_options)
  else:
    build_func = "default"

  tune_option = auto_scheduler.TuningOptions(
    num_measure_trials=3000,
    # builder=auto_scheduler.LocalBuilder(build_func="default"),
    builder = auto_scheduler.LocalBuilder(build_func=build_func),
    runner=auto_scheduler.RPCRunner(
      device_key,
      "127.0.0.1",
      9096,
      timeout=30,
      number=1,
      repeat=2,
      min_repeat_ms=200,
      # enable_cpu_cache_flush=True,  # requred number set to 1
    ),
    measure_callbacks=[auto_scheduler.RecordToFile(log_file)],
  )

  tuner.tune(tune_option=tune_option)
  print("End Ansor tuning...")

  print("Compile...")
  with auto_scheduler.ApplyHistoryBest(log_file):
    with tvm.transform.PassContext(opt_level=3, config={"relay.backend.use_auto_scheduler": True}):
      lib = relay.build(mod, target=tvm.target.Target(target), params=params)

  # print(lib.function_metadata)
  if (use_ndk):
  	# 编译最终的输出物
    lib.export_library(export_lib, ndk.create_shared, ndk_options)
  else:
    lib.export_library(export_lib)
```
### 日志说明
一下模型，有 50 个 task，意味着切分成了 50 个子图
```
----------------------------------------------------------------------
------------------------------  [ Task Scheduler ]
----------------------------------------------------------------------
|  ID  | Latency (ms) | Speed (GFLOPS) | Trials |
-------------------------------------------------
|    0 |        0.050 |          19.95 |     58 |
|    1 |        0.042 |           2.96 |     58 |
|    2 |        0.230 |          14.24 |     58 |
|    3 |        0.358 |           6.45 |     58 |
|    4 |        0.005 |           0.47 |     58 |
|    5 |        0.009 |           0.16 |     58 |
|    6 |        0.011 |           1.62 |     58 |
|    7 |        0.002 |           7.97 |     58 |
|    8 |        0.001 |          -0.00 |     58 |
|    9 |        0.035 |           5.24 |     58 |
|   10 |        0.047 |          16.17 |     58 |
|   11 |        0.041 |          10.51 |     58 |
|   12 |        0.321 |          11.48 |     58 |
|   13 |        0.060 |           9.69 |     58 |
|   14 |        0.062 |          11.93 |     58 |
|   15 |        0.046 |           6.05 |     58 |
|   16 |        0.551 |          28.89 |    116 |
|   17 |        0.070 |          14.60 |     58 |
|   18 |        0.055 |          12.29 |     58 |
|   19 |        0.009 |           3.59 |     58 |
|   20 |        0.010 |           0.81 |     58 |
|   21 |        0.060 |           4.09 |     58 |
|   22 |        0.050 |          10.71 |     58 |
|   23 |        0.088 |          17.72 |     58 |
|   24 |        0.031 |           6.89 |     58 |
|   25 |        0.134 |          11.03 |     58 |
|   26 |        0.048 |          13.53 |     58 |
|   27 |        0.054 |           6.84 |     58 |
|   28 |        0.027 |          -0.00 |     58 |
|   29 |        0.113 |          10.32 |     58 |
|   30 |        0.069 |           7.12 |     58 |
|   31 |        0.074 |          14.58 |     58 |
|   32 |        0.011 |           2.70 |     58 |
|   33 |        0.177 |          14.59 |     58 |
|   34 |        0.020 |           4.54 |     58 |
|   35 |        0.025 |           9.74 |     58 |
|   36 |        0.007 |           0.29 |     58 |
|   37 |        0.128 |          17.77 |     58 |
|   38 |        0.002 |          -0.00 |     58 |
|   39 |        0.041 |           8.89 |     58 |
|   40 |        0.629 |          25.21 |     58 |
|   41 |        0.090 |          13.71 |     58 |
|   42 |        0.244 |          17.12 |     58 |
|   43 |        0.009 |           0.94 |     58 |
|   44 |        0.034 |          15.25 |     58 |
|   45 |        0.482 |          33.03 |    174 |
|   46 |        0.100 |          12.25 |     58 |
|   47 |        0.133 |          10.15 |     58 |
|   48 |        0.417 |          21.87 |    116 |
|   49 |        0.028 |           3.80 |     58 |
|   50 |        0.121 |          24.45 |     58 |
-------------------------------------------------
Estimated total latency: 9.488 ms	Trials: 2999	Used time : 10782 s	Next ID: 16
----------------------------------------------------------------------
------------------------------  [ Search ]
----------------------------------------------------------------------
Sample Initial Population	#s: 1444	fail_ct: 0	Time elapsed: 17.69
GA Iter: 0	Max score: 0.8888	Min score: 0.6143	#Pop: 116	#M+: 0	#M-: 0
GA Iter: 4	Max score: 0.9487	Min score: 0.7730	#Pop: 116	#M+: 1381	#M-: 37
EvolutionarySearch		#s: 116	Time elapsed: 83.24
----------------------------------------------------------------------
------------------------------  [ Measure ]
----------------------------------------------------------------------
Get 58 programs to measure:
........................
************************........................E.
***********************..........
**********Time elapsed for measurement: 106.66 s
----------------------------------------------------------------------
------------------------------  [ Train cost model ]
----------------------------------------------------------------------
Time elapsed for training: 4.57 s
```

tuned 的过程中，不断地 upload 到 server 运行并收集运行数据对 cost model 进行训练

## tune 中断了怎么办
搜索中断后，还可以在原来的基础上继续自动调度，但是这需要自己创建搜索策略和cost模型：
```
def resume_search(task, log_file):
    print("Resume search:")
    cost_model = auto_scheduler.XGBModel()
    cost_model.update_from_file(log_file)
    
    search_policy = auto_scheduler.SketchPolicy(
        task, cost_model, init_search_callbacks=[auto_scheduler.PreloadMeasuredStates(log_file)]
    )
    
    measure_ctx = auto_scheduler.LocalRPCMeasureContext(min_repeat_ms=300)
    tune_option = auto_scheduler.TuningOptions(
        num_measure_trials=5,
        runner=measure_ctx.runner,
        measure_callbacks=[auto_scheduler.RecordToFile(log_file)],
    )
    task.tune(tune_option, search_policy=search_policy)

    # Kill the measurement process
    del measure_ctx

resume_search(task, log_file)
```

![](/images/blog/tvm_interrupt_tips.png)

https://tvm.apache.org/docs/tutorial/auto_scheduler_matmul_x86.html?highlight=resume

## reference
1. https://discuss.tvm.apache.org/t/how-can-i-test-the-performance-of-a-single-operator/8362
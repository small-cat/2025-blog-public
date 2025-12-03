大家好，我是吴震宇。

上一节我们讨论了在 yocto 中通过引入 yocto 开源 layer `meta-external-toolchain` 的方式，来使用预编译好的外部工具链，同时我们留下了一个小问题。在 `meta-external-toolchain` 经常使用的一些变量代表了什么含义。
- TARGET_OS 表示目标操作系统的名称，比如 linux
- TARGET_ARCH 表示目标设备架构，比如 arm,mips,ppc,x86,x86-64,aarch64 等
- TARGET_PREFIX 表示交叉工具链前缀，比如 `aarch64-linux-gnu-`
- TARGET_SYS 由 TARGET_ARCH TARGET_VENDOR TARGET_OS 组成
- EXTERNAL_TARGET_SYS 表示引入外部交叉工具链的 TARGET_SYS 的值，可以自己定义

bitbake 中可以通过 `-e` 选项来查看这些变量的值，比如
```
bitbake -e | grep "TARGET_SYS="
```
这些变量都可以在 `meta/conf/documentation.conf` 中找到对应的描述说明。

当我们引入了 `meta-external-toolchain` 这个开源 layer 之后，如果 layer 中的某个 recipe 不满足我们的需求，需要对它进行修改。但是如果直接修改开源 layer，会导致引入的版本与上游版本有差异，不方便维护，最好的方式就是在自己的 layer 中通过 bbappend 的方式对这个 recipe 中的内容进行扩展。

## append files
bitbake 允许通过一个后缀名为 `.bbappend` 的文件对 recipe 进行扩展。也就是说，保存在 recipe 中的 metadata 可以通过扩展的方式进行添加，修改或者删除。
- 函数可以通过 override 的方式进行修改
- 变量可以通过 override 的方式进行修改
- task 可以通过 addtask 添加，通过 deltask 删除

而 override operators 就是 append, prepend, remove 以及一些赋值操作符 `+=`，`.=`，`=.` 等。

bbappend 文件需要与对应的 recipe 文件名对应，比如 
- `example_0.1.bbappend` 对应的 recipe 文件为 `example_0.1.bb`
- `example_0.%.bbappend` 对应的 recipe 文件可以为 `example_0.1.bb`, `example_0.2.bb` 等，`%` 代表通配符的意思，但是不能对应 recipe 文件 `example_1.0.bb`

bbappend 文件作为对某一个 recipe 的扩展，通常是针对特定版本的 recipe 进行扩展的。如果 recipe 进行了升级，那么 bbappend 文件也要做相应的改动，当然如果 bbappend 文件针对的是通用的扩展改动，可以通过 `%` 通配符的形式通配到多个版本，这样就不需要反复修改了。而 `%` 这种文件名中的通配的使用方式，也仅限于在 bbappend 这种场景中使用，直接在 recipe 文件名中使用是不支持的。

![bbappend example](/images/columns/bbappend_example.png)

## overrides in append file
### 修改函数
如果 bbappend 中需要 install 额外的文件，可以追加 `do_install` task
```
do_install:append() {
  install -d ${D}${sysconfdir}
  install -m 0644 example.conf ${D}${sysconfdir}
}
```
当然，如果操作比较复杂，可以在 bbappend 中定义一个独立的函数，然后在 `do_install:append` 中调用该函数。append 的方式，使得最终 bitbake 为该 recipe 的 install task 生成 `run.do_install.pid` 脚本的时候，会将上述的代码追加到 `do_install` 函数的后面。

shell 函数和 bitbake-style python 函数都可以通过上述方式来修改。

### 修改变量
如果 bbappend 中需要修改变量，可以通过 append/remove/prepend 或者赋值操作符来实现
```
FILESEXTRAPATHS:prepend := "${THISDIR}/files:"
SRC_URI += "file://custom-modification-0.patch \
file://custom-modification-1.patch \
"
```
上面这个代码片段是在 `SRC_URI` 中追加了两个 patch 文件。也可以通过
```
SRC_URI:append = " file://custom-modification-0.patch \
file://custom-modification-1.patch \
"
```
注意使用 `+=` bitbake 会自动加上一个空格，而 append 是没有这个空格的。

默认情况下，bitbake 通过 FILESPATH 变量指定的值作为搜索路径来查找 `SRC_URI` 指定的文件，该变量在 `base.bbclass` 中定义，
```
FILESPATH = "${@base_set_filespath(["${FILE_DIRNAME}/${BP}", "${FILE_DIRNAME}/${BPN}", "${FILE_DIRNAME}/files"], d)}"
```
也就是说 FILESPATH 变量的默认值与当前 recipe 文件的位置有关。比如 `meta-external-toolchain/recipes-external/glibc/glibc-external.bb`，FILESPATH 变量的默认值会包含 `meta-external-toolchain/recipes-external/glibc/files`。但是在 bbappend 中设置了新增的文件时，需要通过 FILESEXTRAPATHS 变量来指定额外的搜索路径，比如
```
FILESEXTRAPATHS:prepend := "${THISDIR}/${BPN}:"
```
`${BPN}` 就是当前 package 的名字，也可以设置成其他的文件目录名。

**注意：使用 FILESEXTRAPATHS 变量时，不能使用 `=` 直接覆盖原始的值，FILESEXTRAPATHS 变量在 `base.bbclass` 中定义且是有默认值的，且该值会在 `insane.bbclass` 中进行校验。所以只能使用 prepend 或者 append**
```
# This default was only used for checking
FILESEXTRAPATHS ?= "__default:"
```
在 `insane.bbclass` 中，在 bitbake 解析 recipe 的时候就会进行校验

![insane check filesextrapaths](/images/columns/insane-filesextrapaths.png)

在 `utils.bbclass` 定义的 `base_set_filespath` 函数中，如果 `FILESEXTRAPATHS` 变量的值不仅仅是 `__default`，就会将其加入到 path 中，这样 `FILESEXTRAPATHS` 变量指定的值就加入到 bitbake 的搜索路径中了。

![base_set_filespath](/images/columns/base_set_filespath.png)

### 打印信息
如果需要在 append 文件中打印一些信息。这个时候就需要注意了，如果是在 task 中打印信息，可以
- 在 shell 函数中通过 bbnote 的方式打印
- 在 python 函数中通过 bb.note 的方式打印

但是如果是想查看 recipe 中某个变量的值，也就是想要在 bitbake 解析 recipe 后就可以看到打印信息，就必须在 python 匿名函数中进行打印。(这部分内容的讨论放到了「recipe 中同时支持 shell 和 python 的实现原理」章节)

这与上面 `FILESEXTRAPATHS` 变量检查一样，放在 python 匿名函数中，bitbake 解析完 recipe 后就会执行。
```
python __anonymous() {
  bb.note('......')
}
```
`__anonymous` 关键字可以省略。

### 添加或删除 task
在 append 文件中，可以通过 addtask 添加 task，通过 deltask 删除 task。

比如对于预编译好的工具链，glibc 这些库直接在指定的 sysroot 中获取，而不需要通过 fetch 的方式下载，可以在 bbappend 文件中删除这个 task
```
deltask do_fetch
```
如果要将所有安装 install 的文件名都保存下来，可以添加一个 shell 函数或者 bitbake-style python 函数，然后将其添加成一个 task
```
do_generate_install_list() {
  find ${D} -type f -name "*" > ${BPN}.list
}
addtask do_generate_install_list before do_package_write_rpm after do_install 
```

### append 文件路径要求
append 文件的路径尽量与 recipe 文件保持一致，这样可以方便 bitbake 识别。比如为 `meta/recipes-extended/sed/sed_4.8.bb` 文件新增一个 bbappend 文件，可以将文件保存在其他 layer 的 `recipes-extended/sed/sed_%.bbappend` 下，不一定非要是在 `recipes-extended` 中，也可是是其他的 `recipes-devtools` 目录中，但是子目录 `sed/sed_%.bbappend` 必须与 `sed_4.8.bb` 保持一致，否则 bitbake 无法识别。查看 bbappend 是否生效，可以通过
```
bitbake-layers show-appends
```
命令查看。

## bbappend 的实现
当给定 package 的名字时，bitbake 会通过 package name 找到对应的 recipe 文件。在 `lib/bblayers/query.py` 中，实现了根据 recipe 文件名找到对应的 appends。

![get appends](/images/columns/get_appends_for_files.png)

filename 保存的是 recipe 的绝对路径，basename 就是 recipe 的文件名，而 `get_file_appends(basename)` 根据 recipe 文件名返回了所有相关的 append 文件。
```
    def get_file_appends(self, fn):
        """
        Returns a list of .bbappend files to apply to fn
        """
        filelist = []
        f = os.path.basename(fn)
        for b in self.bbappends:
            (bbappend, filename) = b
            if (bbappend == f) or ('%' in bbappend and bbappend.startswith(f[:bbappend.index('%')])):
                filelist.append(filename)
        return tuple(filelist)
```
CookerCollectFiles 对象也就是上图中的 `self.tinfoil.cooker.collections[mc]` 会通过 `collect_bbfiles` 通过 `bblayers.conf` 中的 BBLAYERS 变量指定的 layer，根据每一个 layer 中的 `conf/layer.conf` 中指定的 BBFILES，收集所有的 `.bb` 的 recipe 文件以及 `.bbappend` 的 append 文件，分别保存在 `self.bbfiles` 和 `self.bbappends` 中。

`get_file_appends` 函数通过遍历所有的 `self.bbappends` 中的 append 文件，找到其中与 fn 有相同文件名前缀的文件名，那么该 append 文件就是 fn 对应的 recipe 的 append 文件。

bitbake 解析 recipe 时，会同时将该 recipe 对应的所有 append 文件一起解析。这样，recipe 文件与其对应的 append 文件就绑定到一起了。

## 内容小结
本篇我们讨论了 bitbake 中扩展 recipe 的通用方式，通过后缀为 `.bbappend` 的 append 文件来对指定版本的 recipe 进行扩展。append 文件中可以通过 override 机制对 recipe 中的函数或者变量进行改写，同时还可以通过 deltask/addtask 的方式来删除和添加新的 task。而 append 的机制也很容易理解，bitbake 首先找到配置中指定的所有 layer，再根据 layer 中的配置找到所有的 recipe 文件以及 append 文件，然后遍历 append 文件，找到与 recipe 文件名有相同文件名前缀的文件名，那么该 append 文件就是 recipe 文件对应的 append 文件。这样，通过 show-appends 就可以查看到所有 recipe 及其对应的 append 文件了。

## reference
1. [yocto terms](https://docs.yoctoproject.org/ref-manual/terms.html?)
2. [appending other layers metadata with your layer](https://docs.yoctoproject.org/dev-manual/layers.html#appending-other-layers-metadata-with-your-layer)
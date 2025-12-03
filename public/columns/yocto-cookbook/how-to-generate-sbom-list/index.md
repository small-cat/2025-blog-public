大家好，我是吴震宇。

recipe 作为 layer 的重要组成部分，通过 metadata 的形式详细描述了 bitbake 应如何对 package 进行构建的过程，包括 package 的描述信息，版本信息，依赖信息，源代码来源以及 configure、compile、install 等的具体操作过程。

本文就来谈谈，如何利用 recipe 中提供的这些信息，来为 package 生成 apache 规范的 sbom list。

## SBOM 的介绍
SBOM 全称是 `Software Bill of Materials`, 即软件物料清单。SBOM 是一系列专门应用于软件的元数据，关键信息包括组件名称、许可证信息、版本号和供应商，这些基本详情在分析软件漏洞时发挥着关键作用。

2021年年中，NTIA发布了软件物料清单（SBOM）的最少必需元素。这些元素包含以下三类：
- 数据字段：每个软件组件的基本信息
- 自动化支持：能够自动生成机器可读格式的SBOM
- 实践和流程：SBOM 应该如何及何时生成和分发
所需元素的目的是为 SBOM 使用者提供他们所需的信息，以管理漏洞、清点软件组件，并监管许可证合规性。

在软件开发和部署过程中，可以使用 SBOM 来评估和审查所依赖的软件组件，从而确保软件产品的质量、安全性和合规性。这是因为 SBOM 中包含了用于构建软件的各种组件的详细信息和关系，包括开源软件和所有引入的第三方软件，而这些也是是安全软件开发框架（secure software development framework）的关键要素。

软件组件可能来自于各种不受监管的来源：供应商代码、合作伙伴代码、开源项目和内部开发等。开发人员经常使用来自各种地方的代码（开源和第三方代码），这些代码不像商业软件那样具有相同的入站控制和审查。所以通过 SBOM，软件公司可以识别：
- 软件中的组件/成分
- 这些组件来自哪里
- 每个组件的许可证信息
- 软件（及其运行的设备）的安全漏洞状态
- 哪些部分需要评估和补救（以及您在此过程中的位置）
- 向客户和合作伙伴交付的合规性工件

软件在构建过程中，可以手动生成 SBOM list，也可以借助工具自动生成 SBOM，在 yocto 中，poky 提供了能够直接生成 apache v2 格式的 sbom 清单，通过一个 task 即可为每一个 package 生成 sbom 信息，结果保存在一个 json 格式的文件中。

## poky 中 sbom 的生成
poky 的较新版本中，新增了一个 task 专门用于生成 package 对应的 sbom 信息。通过 git log 发现，create_spdx.bbclass 是在 2021-09-01 加入的，大概就是在 Hardknott 和 honister 版本中开始引入的。而更早的 poky 版本中，是没有支持该功能的。

### 使用方式
开启 sbom 生成的功能非常简单，就是在 layer 的 conf 配置文件中，继承上面提到的 create_spdx 即可
```
INHERIT += "create_spdx"
```
当使用 bitbake 进行构建时，可以发现每一个 package 都会有一个 `do_create_spdx` 的任务，该任务会将 package 对应的 sbom 信息生成到 `build/tmp/deploy/spdx/MACHINE/` 中。而在每一个 package 对应的 `${WORKDIR}` 中，也会存在一个 spdx 的目录，保存当前 package 的 sbom 信息。

而 image 构建结束后的 sbom 信息，保存在 `build/tmp/deploy/images/MACHINE` 文件夹中，其中
- IMAGE-MACHINE.spdx.index.json 包含了构建 image 关联的所有 recipe 对应的 sbom 文件的索引信息
- IMAGE-MACHINE.spdx.json 为该 image 对应的 sbom 信息，也包含了相关的 recipe 的 sbom 文件的路径等内容。
- IMAGE-MACHINE.spdx.tar.xz 打包压缩了 image 关联的所有 recipe 的 sbom 文件

create_spdx 还提供了一些额外的变量用来控制 sbom 文件的输出形式。

比如 `SPDX_PRETTY` 变量可用于控制输出的 sbom 的 json 文件更具有可读性，bitbake 在生成 sbom 文件时，会加入额外的缩进和换行符，避免所有信息都生成在同一行中。
```
SPDX_PRETTY = "1"
```
而 `SPDX_ARCHIVE_SOURCES` 必须与 `SPDX_INCLUDE_SOURCES` 一起才能生效，使得 bitbake 会将 package 的源代码一起打包同 spdx 一起输出。
```
SPDX_INCLUDE_SOURCES = "1"
SPDX_ARCHIVE_SOURCES = "1"
```
`SPDX_CUSTOM_ANNOTATION_VARS` 允许用户在 recipe 对应的 sbom 的信息中添加一些额外的自定义的标注信息，比如
```
ANNOTATION1 = "First annotation for recipe"
ANNOTATION2 = "Second annotation for recipe"
SPDX_CUSTOM_ANNOTATION_VARS = "ANNOTATION1 ANNOTATION2"
```
这样生成的 sbom json 文件中，就会包含这两个 annotation 信息
```
"annotations": [
  {
    "annotationDate": "2023-04-18T08:32:12Z",
    "annotationType": "OTHER",
    "annotator": "Tool: oe-spdx-creator - 1.0",
    "comment": "ANNOTATION1=First annotation for recipe"
  },
  {
    "annotationDate": "2023-04-18T08:32:12Z",
    "annotationType": "OTHER",
    "annotator": "Tool: oe-spdx-creator - 1.0",
    "comment": "ANNOTATION2=Second annotation for recipe"
  }
]
```

更多配置，可以查看 [variables](https://docs.yoctoproject.org/dev/ref-manual/variables.html)

前面提到，poky 中引入生成 sbom 的功能是在 2021-09-01 之后，而早起的版本，比如 sumo 中是没有这些功能的。如果需要在早起的版本中使用，就需要将这部分功能抽取出来，手动引入到早起的 poky 版本中。所幸的是，`meta-wr-sbom` 开源 layer 中已经实现了这部分的功能。

### meta-wr-sbom
[meta-wr-sbom](https://github.com/Wind-River/meta-wr-sbom) 这个开源 layer 的实现，就是将 create-spdx.bbclass 这个功能抽离了出来，进行了封装和重写，并独立成了一个 layer 的形式，因为主要是 python 代码的实现，所以能够兼容大部分的 poky 版本，可以在 layer.conf 中查看当前兼容的 poky 版本。
```
LAYERSERIES_COMPAT_sls-sbom = "wrl hardknott dunfell gatesgarth zeus warrior thud sumo rocko pyro morty honister kirkstone langdale"
```
在使用时，直接在 bblayers.conf 中引入该 layer 即可，bitbake 就会在构建时为所有的 recipe 生成 sbom 文件，因为在 `meta-wr-sbom` 的 `conf/layer.conf` 配置文件中，已经继承了 `sls-create-spdx`
```
INHERIT += 'sls-create-spdx'
```

### create_spdx 的实现分析
create-spdx.bbclass 使用 bitbake-style 的 python 语法，定义了 `do_create_spdx()` 方法，同时将该函数作为 bitbake 的一个 task
```
addtask do_create_spdx after do_package do_packagedata do_unpack before do_populate_sdk do_build do_rm_work
```
`do_create_runtime_spdx` 是创建运行时 runtime 相关的 sbom 文件的一个 task，在 `do_create_spdx` 后面执行。这与 do_package 分包有点类似，相当于为每一个 rpm 对应的包都生成了一个单独的 sbom 文件。

在 `do_create_spdx` 中，
```
    include_sources = d.getVar("SPDX_INCLUDE_SOURCES") == "1"
    archive_sources = d.getVar("SPDX_ARCHIVE_SOURCES") == "1"
    archive_packaged = d.getVar("SPDX_ARCHIVE_PACKAGED") == "1"
```
对这三个变量首先进行了检查，这也是 create-spdx.bbclass 提供的控制 sbom 生成的一些控制变量。

`do_create_spdx` 收集了创建 sbom 文件的时间，license 信息，creator 信息，SRC_URI 源代码来源，package 的描述信息 DESCRIPTION，SUMMARY，从 patch 中分析相关的 CVE 漏洞信息，以及 recipe 中 DEPENDS 的依赖信息等，将这些内容全部都输出到最终的 sbom 文件中。

整个 `do_create_spdx` 的实现就是一个很长的 python 函数，这样如果需要对其中部分内容进行修改，而不修改整个 `do_create_spdx` 的流程，可以按照 python monkey patch 的方式来进行。(如果使用 override 的方式重写整个 `do_create_spdx` 的函数，会有很多部分都是重复的代码，因为大多情况下只需要修改其中某个部分)

举一个例子，在 `do_create_spdx` 中，会根据 `CVE_PRODUCT` 和 `CVE_VERSION` 两个变量，来生成当前 recipe 中 package 对应源代码的 cpe_id

![gen cpe id](/images/columns/cpe_id_in_sbom.png)

如果想对生成的 cpe_ids 进行一些修改，可以按照如下的方式对 `oe.cve_check.get_cpe_ids` 进行封装
```
do_create_spdx:prepend() {
  original_get_cpe_ids = oe.cve_check.get_cpe_ids

  def custom_get_cpe_ids(cve_product, version):
    cpe_ids = original_get_cpe_ids(cve_product, version)

    new_cpe_ids = []
    for cpe_id in cpe_ids:
      # do something on cpe_id
      ...
      new_cpe_ids.append(cpe_id)
    return new_cpe_ids

  oe.cve_check.get_cpe_ids = custom_get_cpe_ids
}
```
然后在 `do_create_spdx` 任务结束时，将上面的替换复原
```
do_create_spdx:append() {
  oe.cve_check.get_cpe_ids = original_get_cpe_ids
}
```
这样，就实现了对 `cpe_ids` 的定制化修改了。

## 内容小结
本文介绍了 SBOM 软件物料清单的概念以及 poky 中生成 sbom 的方法。poky 在 honister 分支中就引入了对 sbom 生成的支持，在早起的版本中没有，可以通过引入 `meta-wr-sbom` 开源 layer 的方式支持在早起 poky 版本中生成 sbom 清单列表。当需要定制化 `do_create_spdx` 任务时，可以通过 python monkey patch 的机制对部分 python function 进行封装修改。

## reference:
1. https://shenxianpeng.github.io/2023/06/sbom/
2. https://www.cnblogs.com/sealio/p/16744154.html
3. https://docs.yoctoproject.org/dev/ref-manual/variables.html
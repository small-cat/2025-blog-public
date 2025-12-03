大家好，我是吴震宇。

yocto 构建系统在构建时，在 `do_fetch` 任务完成源代码的下载后，会通过 `do_unpack` 将源代码解压到 `${S}` 中，之后会执行 `do_patch` 任务，在源码上 apply 相应的 patch。

本章就来分析一下 `do_patch` 任务的实现原理。

## do_patch 的实现
在 `meta/classes/patch.bbclass` 中，
```
EXPORT_FUNCTIONS do_patch
```
通过 `EXPORT_FUNCTIONS` 导出了 `do_patch` 函数，而实际定义是在 `patch_do_patch` 函数中，这也是 yocto 中函数的一种定义方式，通过 `classname_functionname` 的方式定义，然后通过 
```
EXPORT_FUNCTIONS functionname
```
的形式导出函数作为一个可调用的接口。

重点来看下 `patch_do_patch` 函数。
```
   patchsetmap = {
        "patch": oe.patch.PatchTree,
        "quilt": oe.patch.QuiltTree,
        "git": oe.patch.GitApplyTree,
    }

    cls = patchsetmap[d.getVar('PATCHTOOL') or 'quilt']

    resolvermap = {
        "noop": oe.patch.NOOPResolver,
        "user": oe.patch.UserResolver,
    }

    rcls = resolvermap[d.getVar('PATCHRESOLVE') or 'user']
```
bitbake 中提供三种 patch apply 的方式，分别使用了 patch，quilt 和 git，默认为 quilt。

`src_patches` 函数，返回当前 recipe 对应的所有 patch 信息。

通常，patch 文件与 recipe 都是在同一级目录中，在 recipe 中，通过 SRC_URI 变量指定源代码需要使用的 patch 文件。比如 `boost_1.78.0.bb` 中 SRC_URI 
```
SRC_URI += "file://boost-CVE-2012-2677.patch \
           file://boost-math-disable-pch-for-gcc.patch \
           file://0001-Don-t-set-up-arch-instruction-set-flags-we-do-that-o.patch \
           ...
           "
```

在 `src_patches` 中，调用 `patch_path` 函数，来查找实际的 patch 文件
```
def patch_path(url, fetch, workdir, expand=True):
    """Return the local path of a patch, or return nothing if this isn't a patch"""

    local = fetch.localpath(url)
    if os.path.isdir(local):
        return
    base, ext = os.path.splitext(os.path.basename(local))
    if ext in ('.gz', '.bz2', '.xz', '.Z'):
        if expand:
            local = os.path.join(workdir, base)
        ext = os.path.splitext(base)[1]

    urldata = fetch.ud[url]
    if "apply" in urldata.parm:
        apply = oe.types.boolean(urldata.parm["apply"])
        if not apply:
            return
    elif ext not in (".diff", ".patch"):
        return

    return local
```
patch 文件以 `.diff` 或者 `.patch` 为后缀。

获取 patch 信息后，创建 patchset 和 resolver 对象
```
if not patchdir in classes:
    patchset = cls(patchdir, d)
    resolver = rcls(patchset, oe_terminal)
    classes[patchdir] = (patchset, resolver)
    patchset.Clean()
else:
    patchset, resolver = classes[patchdir]
```
cls 就是 bitbake 实际调用的 patchset 的类，通过 `PATCHTOOL` 对象指定，默认为 quilt，这里以 git 为例，那么 cls 为 `oe.patch.GitApplyTree`，同时设置 patch 的属性
```
patchset.Import({"file":local, "strippath": parm['striplevel']}, True)
```
local 表示本地 patch 文件，striplevel 表示 patch 后去掉的路径层级，该参数在 patch 命令中对应的选项为 `-p`。
```
resolver.Resolve()
```
Resolve 就是实际在往源代码中 apply patch 了。

resolver 是 rcls 类，默认也就是 `oe.patch.UserResolver`。在 Resolve 函数中，实际调用的是 
```
self.patchset.Push(False)
```
bitbake 中实现了三种打 patch 的方式

![bitbake patchset](/images/columns/bitbake-patchset.png)

在 PatchTree 中实现了 Push 接口的定义。
```
def Push(self, force = False, all = False, run = True):
        bb.note("self._current is %s" % self._current)
        bb.note("patches is %s" % self.patches)
        if all:
            for i in self.patches:
                bb.note("applying patch %s" % i)
                self._applypatch(i, force)
                self._current = i
        else:
            if self._current is not None:
                next = self._current + 1
            else:
                next = 0

            bb.note("applying patch %s" % self.patches[next])
            ret = self._applypatch(self.patches[next], force)

            self._current = next
            return ret
```
其他子类通过重写 _applypatch 方法或者 Push 方法的方式定义各自 apply patch 的动作。

### 自定义 do_patch
前面分析了 patch.bbclass 文件中定义的 `patch_do_patch` 函数，也是实际 patch.bbclass 暴露出来的 `do_patch` 接口。

`do_patch` 在给源代码打补丁之前，首先需要找到本地的 patch 文件，而这些文件是通过 `SRC_URI` 变量指定的。

假设有这么一种情况，源代码和 patch 文件都是从远程下载下来的压缩包，这个时候，通过 `SRC_URI` 只能指定远程源代码和 patch 文件的下载 url，而不能直接指定 patch 文件了。

此时，如果需要打 patch，就需要自定义 `do_patch` 函数了，再在自定义的 `do_patch` 函数需要调用 `patch_do_patch` 函数。
```
python do_patch() {
  bb.build.exec_func('get_patches_before', d)
  get_patch_files(d)
  bb.build.exec_func('patch_do_patch', d)
}
```
bitbake 提供的接口 `bb.build.exex_func` 既可以执行 shell 函数，也可以执行 python 函数。`get_patches_before` 可以是一下 shell 函数
```
get_patches_before() {
  # do something before get patches
  ...
}
```
做一些准备工作，比如对解压缩的源代码进行处理，对解压缩的 patch 文件做一些处理等。

`get_patch_files` 函数是一个 python 函数，目的是获取下载到本地的 patch 文件，然后将 patch 文件添加到 `SRC_URI` 中。
```
def get_patch_files(d):
  ...
  # get all the patch files and save to variable patch_files
  for patch_file in patch_files:
      bb.note("Appending patch file: %s" % patch_file)
      d.appendVar('SRC_URI', ' file://%s' % patch_file)
```
patch 添加到 `SRC_URI` 中，就相当于通过 `SRC_URI` 直接指定 patch 文件了。这样，再调用 `patch_do_patch` 就可以找到 patch 文件，然后打 patch 了，也就是原本打补丁的流程。

这种方式也是一种动态添加 patch 文件然后打 patch 的方式。不过需要注意的是，patch 文件的使用是需要按顺序进行的，所以在往 `SRC_URI` 中添加 patch 文件 location 的时候，需要注意顺序。

## 内容小结
本章分析了 do_patch 任务的实现原理，并介绍自定义 do_patch 任务的方式。

**值得注意的是，自定义的 do_patch 任务，通过在 `SRC_URI` 中添加 patch 文件 location，来实现动态添加 patch 文件。但是该 `SRC_URI` 变量，也就是保存有额外 patch 文件的 `SRC_URI` 变量只在当前 do_patch 任务中生效。其他任务中的 `SRC_URI` 变量不包含这些 patch 文件的 location，保存的仅仅是在 recipe 中为 `SRC_URI` 指定的内容。如果需要在其他任务中使用这些 patch 文件，需要在其他任务中也调用 `get_patch_files` 函数。**
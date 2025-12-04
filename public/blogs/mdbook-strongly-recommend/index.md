[mdbook](https://rust-lang.github.io/mdBook/index.html) 是一个能够支持 markdown 文件生成书籍的命令行工具，非常适合创建产品或 API 文档、教程、课程材料。同时支持各种插件，能通过插件，来一键生成各种不同主题的文档，同时能生成各种不同格式的文档，比如 html、epub、pdf 等。

# installation
mdbook 安装方式很简单，可以直接在 github release 上下载 prebuilt binaries
```
github release：https://github.com/rust-lang/mdBook/releases
```
也可以通过 cargo 下载最新版本进行安装
```
cargo install --git https://github.com/rust-lang/mdBook.git mdbook
```
# command line 
mdbook 的命令行使用方式很简单，简单几个参数就能完成 book 的初始化以及构建。来看一个例子
![mdbook command line](/images/blog/mdbook.gif)

- mdbook init 初始化当前仓库。会创建 book 目录，生成的文件默认都放在该目录中。而源 markdown 文件都放在 src 目录中，SUMMARY.md 就是一个目录文件，管理所有的章节，SUMMARY.md 中尽量都使用相对路径。book.toml 就是配置文件。配置参数后面会详细解释一下。
- mdbook build 构建书籍，会在 book 目录中生成 html 的文件
- mdbook serve --open 打开默认浏览器，通过一个 http server，在浏览器上预览该书籍。

看下我们这个例子中的 SUMMARY.md 的内容
```
# Summary

- [Chapter 1](./chapter_1.md)
    - [sub Chapter 1-1]()
- [Chapter 2]()
```
`chapter_1.md` 就是一个相对路径，Chapter 1 就是章节名。在 `sub Chapter 1-1` 中没有给出路径，意思就是还没有创建实际的文件。可以看下通过 http server 在浏览器预览的真实界面
![test for mdbook](/images/blog/mdbook-example.png)
两个没有创建实际文件的章节在左侧的目录中颜色都是灰色的。

# configuration
我们来看下 book.toml 中都有哪些配置。熟悉 rust 的童鞋对 .toml 这种配置文件一定不陌生，在 rust 项目构建中也都是使用的这种配置通过 cargo 来进行编译构建的。

当使用 `mdbook init` 时会创建一个 book.toml 的配置文件，里面就是通用配置。
```
[book]
authors = ["猫步旅人"]
language = "zh"
multilingual = false
src = "src"
title = "test for mdbook"
description = "test for mdbook"
text-direction = "ltr"
```
- language 表示当前 book 主要使用的语言，可以为 en，zh
- src 表示 markdown 源文件的目录
- text-direction 表示文本的方向，ltr 表示 left to right, rtl 表示 from right to left。

上面那张截图，展示了基本配置下 mdbook 生成的书籍的预览效果。

mdbook 在 rust 语言支持上做的非常好，嵌入到文档中的 rust 代码片段甚至支持直接运行。比如
```
[rust]
edition = "2021"

[output.html.playground]
editable = true
copyable = true
copy-js = true
line-numbers = true
runnable = true
```
- edition 表示 rust 版本，默认版本是 2015，可以是 2018， 2021，这表示 rust 风格的代码片段的对应版本。

而 `output.html.playground` 是 mdbook 中的 html 的 render，表示构建 book 生成的 html 中，代码片段是可以编辑的，且可以被 copy，同时还有一个运行按钮，可以直接运行 rust 代码片段。

那么 mdbook 中的render 是什么，这是 mdbook 中跟插件相关的一个很重要的概念。

## renderers
Renderers 也被称为后端 backends，就是负责渲染生成 book 的生成器。我们前面所说的各种插件，在 output 时都会有各自不同的 output 的方式，可以理解成不同的渲染风格。mdbook 有两个内置的 renderers，分别是 html 和 markdown。其他第三方的 renderers，可以在 `https://github.com/rust-lang/mdBook/wiki/Third-party-plugins` 找到。

在 book.toml 中启用一个 render 需要通过 output 的方式来进行配置
```
[output.html]

[output.markdown]

[output.wordcount]
```
这其实就启用了三个 renderers，最终输出时，在 build-dir 中指定的目录中，会生成三个不同的目录，分别是 html、markdown、wordcount。html 是默认的，如果没有配置，而配置了其他的 render，默认的 html 后端被认为是 disabled，再次启用就需要显示的指定出来，就像上面那样。
wordcount 是一个新的 render，需要下载安装才能使用。

在 html 这个 renderer 中，有很多配置，我们在使用 html 预览的时候，在右上角有几个小图标，就是 html 这个 renderer 配置中进行控制的。
![mdbook icon](/images/blog/mdbook-icon.jpg)
第一个表示左侧的章节目录，第二个是颜色主题按钮，第三个是搜索。这三个通常都是默认的。

第四个打印按钮，可以在
```
[output.html.print]
enable = true
page-break = true # 插入分页符，默认是 true
```
中进行配置。

第五个按钮是 github 按钮，可以链接到当前这个 book 所在的 github 的仓库。
```
[output.html]
git-repository-url = ""
git-repository-icon = "fa-github"
```
`fa-github` 是 github 的图标，如果是 `fa-code-fork` 就是 github 上 fork 的那个图标。这里的链接不一定非要指向当前 book 的仓库，你可以指向你的个人简介，也可以指向你的个人book，甚至指向你的 github 主页。(不过一些恶意引流的操作不推荐)。

第六个按钮是一个编辑按钮，可以通过这个配置直接编辑当前 book 的源码文件，
```
[output.html]
edit-url-template = "https://github.com/<owner>/<repo>/edit/<branch>/{path}"
```
`{path}` 会被 mdbook 自动解释成当前文件的路径。

其实，一个 renderer 就是一个二进制程序，在 mdbook 构建 book 做渲染的时候被调用。而 renderer 可以帮助我们生成各种不同主题的书籍，这些不同主题，就是不同的 css 样式，预览出来的就是不同的排版效果。下面来介绍几款比较方便的插件。

# plugins
## mdbook-pagetoc
mdbook-pagetoc 插件，主要是辅助生成每一个章节的目录。在预览 book 的时候，能够在每一个章节的右侧显示当前章节的目录。看下插件的预览效果
![mdbook pagetoc](/images/blog/mdbook-pagetoc.png)
右侧边栏显示出了当前 chapter 1 的目录。

### 安装插件
```
cargo install mdbook-theme
```
安装完成后，可以通过 
```
cargo install --list
```
查看，结果中会有
```
mdbook-theme
mdbook-theme-ace
```
表示安装成功。

### 配置方法
插件配置很简单，在 book.toml 中加上如下配置即可
```
[preprocessor.theme]
pagetoc = true

[output.html]
additional-css = ["theme/pagetoc.css"]
additional-js = ["theme/pagetoc.js"]
```

使用 `mdbook build` 或者 `mdbook serve --open` 就可以看到预览的效果了。

但是细心的童鞋可能已经发现了，为什么预览的页面最上方，有一个奇怪的
```
{comment}
```
分析发现，在生成的 `theme/index.hbs` 文件中，总是出现这么一段 html 代码
```
<div id="content> class="content">
<main>
  {comment}
  <div class="sidetoc"><nav class="pagetoc"></nav></div>

  {{{content}}}
</main>
```
这段代码显然是这个 mdbook-pagetoc 主题插入的。在生成 html 时，内容标签部分最开始就会有一个 `{comment}`。

在安装目录中搜索发现，这个是在 `.cargo/registry/src/index.crates.io-6f17d22bba15001f/mdbook-theme-0.1.4/src/theme/mod.rs` 中插入的。看下具体代码实现
```
    fn process_index(&mut self) {
        let comment = "<!-- Page table of contents -->";
        if self.content.get().contains(comment) {
            return;
        }
        let insert = r#"  {comment}
                        <div class="sidetoc"><nav class="pagetoc"></nav></div>

                        "#;
        self.content
            .insert(insert, "<main>", "{{{ content }}}")
            .unwrap();
    }
```
在 `process_index` 函数中，如果 `self.content` 中包含了 `<!-- Page table of contents -->`，则不做任何处理。否则，在 `self.content` 中插入一段 html 代码。而 insert 变量的内容就是我们上面发现的那个奇怪的字符串 `{comment}`。既然发现了元凶，那将 `{comment}` 去掉就好了。

去掉之后，别忘记重新编译，因为修改了代码，需要重新编译安装一遍 mdbook-pagetoc 插件。
```
cargo uninstall mdbook-theme
cargo install mdbook-theme
```
最后看下效果。
![pagetoc fix](image/mdbook-pagetoc-fix.png)
最上面 `{comment}` 消失了。

## mdbook-private
mdbook-private 是一个 mdbook 的 preprocessor，用于定义和选择性的隐藏书中的私有部分和章节。安装方式很简单
```
cargo install mdbook-private
```
看下该插件的配置方式
```
[preprocessor.private]
remove = true
style = true
notice = "CONFIDENTIAL"
chapter-prefix = "HID_"
```
- remove 表示是否移除私有章节
- style 表示是隐藏的私有章节的样式
- notice 右上角显示的一个提示字符串
- chapter-prefix 表示设置为 private 章节的名称前缀，即带有该前缀的章节表示为 private，如果 remove 为true，会被移除，也就是在预览界面看不到该章节

看下效果
```
# Summary

- [Chapter 1](./chapter_1.md)
    - [sub Chapter 1-1](./chapter_1-1.md)
- [Chapter 2](./chapter_2.md)
```
有两个章节，一个子章节。
![private ori](image/mdbook-private-origin.png)

将 chapter 2 设置为 private
```
# Summary

- [Chapter 1](./chapter_1.md)
    - [sub Chapter 1-1](./chapter_1-1.md)
- [Chapter 2](./HID_chapter_2.md)
```
重新预览
![mdbook private](image/mdbook-private-after.png)
可以看到 chapter 2 被隐藏了。

这个插件，当我们在展示的时候，可以很方便的帮助我们选择性的隐藏一些不能公开的章节。

## mdbook-pandoc
该 renderer，通过 pandoc，可以将书籍输出成 pandoc 能够支持的许多格式，比如 epub、pdf 等。
### installation
```
cargo install mdbook-pandoc
```
也可以直接安装提交到 github 上的最新版本
```
cargo install --git https://github.com/max-heller/mdbook-pandoc.git mdbook-pandoc
```
在安装过程中，rustc 在编译 ureq-2.9.3 的时候出现了如下错误
![ureq compile error](image/mdbook-ureq-error.png)
看下错误信息，是由于 Header 这个自定义结构体申明为 pub(crate), rustc 认为是 crate private 类型的，不能在后续那些函数中直接使用。我没写过 rust，不过错误信息很明显，那就将 Header 类型直接改成 pub 好了。将 Header 由 pub(crate) 改成 pub
```
pub struct Header
```
再来编译一下就 OK 了。(大家可以查看下有没有相关的patch，应该有更好的方法来解决这个问题)。我出现这个问题的 rust 版本为
```
rustc 1.72.1 (d5c2e9c34 2023-09-13)
```

### configuration
启用该 renderer，必须使用 output.pandoc，比如输出成 pdf，可以使用下面的配置
```
[output.pandoc]

[output.pandoc.profile.pdf]
output-file = "output.pdf"
to = "latex" # output format

pdf-engine = "xelatex"
file-scope = true
number-sections = true
standalone = true # 使用合适的 header 和 footer
table-of-contents = true
```
在使用之前，首先需要保证你的环境中安装了 pandoc 以及 pandoc 使用所需的 xelatex engine，如果没有需要先安装一下，比如在 macos 中，
```
brew install pandoc
brew install texlive
```
当 markdown 文档中包含中文时，仅仅使用上述的配置，pandoc 在转换的时候，会发生错误，不能正确处理中文。首先 book.toml 中通用配置
```
language = "zh"
```
设置成中文，其次还需要为 pdf 设置能支持中文的字体
```
[output.pandoc.profile.pdf.variables]
lang = "zh_CN.UTF-8"
mainfont = "STSong"
```
mainfont 设置的就是字体，这个字体的名称从哪来呢，可以通过
```
fc-list
```
命令查看。比如
```
/System/Library/Fonts/Supplemental/Songti.ttc: STSong:style=常规体,Regular,標準體,Ordinær,Normal,Normaali,Regolare,レギュラー,일반체,Regulier,Обычный
```
这就是宋体，字体的名称就是 `STSong`。设置好之后，
```
mdbook build
```
在 build-dir 所设置的目录中，就可以看到 `pandoc/pdf` 目录下生成的文件了。
![pdf example](image/mdbook-pdf-example.png)

# 总结
mdbook 是一个非常简洁的工具，几个简单的命令行即可开始你的写作之旅，帮助你快速将 markdown 文档转成你想要的格式，还能支持浏览器的实时预览。
通过各种插件，和几个简单的配置，就可以实现各种样式，而 mdbook-private 还可以根据需求选择性的隐藏一些章节，很人性化。喜欢的小伙伴大可放心的尝试一下，也许你会爱上这个小工具。

好了，今天的分享就到这里。我是猫步旅人，一名热爱技术的程序员，希望我的分享对你有所帮助。
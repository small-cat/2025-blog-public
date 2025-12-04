## transformer introduction
![](/images/blog/transformer-intro/1.png)

transformer 是多层 encoder 堆叠的一个大模型。白板的 transformer 是 6 层 encoder 的堆叠，gpt-2 有 48 层
seq2seq：输入是一句话，输出也是一句话

![](/images/blog/transformer-intro/2.png)

![](/images/blog/transformer-intro/3.png)

encoder 有一个输入，decoder 也有一个输入
比如翻译，英译中，输入英文，对应 decoder 也需要有一个中文。两个输入一起走。（训练）
但是在预测过程中，给了一句英文，需要预测生成中文。一次生成一个中文的词，生成一个词，在拿过来生成第二个词，一次不停地循环迭代。

![](/images/blog/transformer-intro/4.png)

37000 个词，每一词对应的字典中，都有 512 个浮点数，作为静态 embedding。d_model，也就是 model dimension，模型的维度。也就是词对应的 embedding 宽度，上面 transformer 中是 512，gpt 中词的格式由 37000 扩展到了 50257 个。当说把模型做大的时候，首先就是将 d_model 拉宽。
位置编码对应的就是词之间上下文的位置信息。transformer 是 512， gpt2 中是 1024，也就限制了一句话最长的长度，gpt2 中是 0 - 1023，sequence
位置信息，可以是手动编写规则生成的，比如 transformer 中，也可以是训练出来的。每一个词(token)出现的位置。进入到 encoder 中的任何一个 token，就是 embedding + positional，所以上图中，两者的维度都是 512 的向量，组成了一个新的词向量，即包含词的信息，也包含词的位置信息。

![](/images/blog/transformer-intro/5.png)

单个 encode，输入是 512 维，输出还是 512 维。
输入每一个 token，就是 embedding + positional 的向量 512 维度。
encoder 的作用，比如上图中两个输入 token，一个 thinking，一个 machines，这两个向量表示，encoder 就是将句子上下文的关系，融入到 token 向量中。将句子中抽出来的这两个向量表示，没有彼此之间的关系，经过 encoder 计算后，输出了另两个 512 维的向量表示，但是输出的两个向量包含了彼此之间的关系。
attention 是对这句话的操作。token 和 token 的交互操作就是在 attention 这一层。
模型放大，一个就是 d_model 扩大，另一个就是 encoder 堆叠的层数变多。gpt2 堆叠到了 90 多层。

![](/images/blog/transformer-intro/6.png)

attention 本质上实现了一个 K-V 的查询。
一句话中的这个词 token，与这句话中其他 token 包括自己之间的关联关系。输出的就是这个 token，与其他 token 之间的关联关系。每一个 token，与其他的 token 组成一个 Key-Value，10 个 token 就组成了 10 个 Key-Value
计算一个 query，一个 token 与其他所有 token 的相似度，对每一个 token 的 key 计算相似度得到  score。然后将每一个 key 对应的 value (512 维的向量表示)，与 score 进行一个加权平均，得到一个 512 维度的向量，这个就是 attention 针对该 token 的输出，这个新的输出取代原来 512 维的向量表示。这个 512 维向量包含了对整个句子中所有 token 相似度的一个加权平均。
attention 最早在 RNN 中就存在了。self-attention 是自己看自己，自己在当前句子中的上下文关系。

![](/images/blog/transformer-intro/7.png)

512 维度太高，压缩到 64 维度，就是 linear(512, 64)

![](/images/blog/transformer-intro/8.png)

Q dot K 计算相似度 score
softmax 将结果变成了概率 probability

![](/images/blog/transformer-intro/9.png)

![](/images/blog/transformer-intro/10.png)

这就是 multi-head，重复 8 遍，每一遍就是一次 head
将 512 维度压缩成了 64 维度，将 8 个 head 拼成一个矩阵(横着拼) 64 x 8 = 512

![](/images/blog/transformer-intro/11.png)

最终输出，还需要压缩回去，输入与输出的维度和 shape 相同
**NOTE：self-attention 中 Q, K, V 的计算结果，最终会输出成一个 KV 的形式保存到内存中(显存)。这样的好处是，减少重复计算。**

![](/images/blog/transformer-intro/12.png)

归一化
X 表示自身，Z 表示  self-attention 的结果，将两者进行相加，然后做归一化处理。关键就是这个相加操作

![](/images/blog/transformer-intro/13.png)

先放宽，然后压缩回去

---

decoder 时，已经生成了一部分的词了。
mask 的作用就是只能看前半部分，不能看后半部分。这对于预测的时候没有意义，因为此时只生成了前半句。
在训练的时候，英译中，decoder 输入的中文，通过 mask 可以让 decoder 不考虑输入的中文的后半句。不看答案。

![](/images/blog/transformer-intro/14.png)

![](/images/blog/transformer-intro/15.png)

mask 就是只让看之前的，不让看后面的部分。这样来进行预测，训练

![](/images/blog/transformer-intro/16.png)

多分类，512 维的输入，变成了 37000 个分数，softmax 将其变成了 37000 个概率，要选择 37000 个字典中的那个词。
gpt 里面采样的参数，好像是 temperature。

![](/images/blog/transformer-intro/17.png)

![](/images/blog/transformer-intro/18.png)

![](/images/blog/transformer-intro/19.png)

decoder 的堆叠，就是纯生成了。

![](/images/blog/transformer-intro/20.png)

给你一个英语，给你一个指令，让你把英语翻译成法语。同时给出法语的答案。
训练时，英语 + 指令 + 法语 是作为一句话输入的。
而 transformer 中 input 给 encoder，输出给 decoder。
在推理预测时，gpt 的  prompt 就是，英语+指令。给出前面一半，gpt 将后面的内容补充完整。

![](/images/blog/transformer-intro/21.png)

- a visual and interactive guide to the basics of neural networks：https://jalammar.github.io/visual-interactive-guide-basics-neural-networks/
- the llustrated word2vec: https://jalammar.github.io/illustrated-word2vec/
- the llustrated bert,elmo,and co.: https://jalammar.github.io/illustrated-bert/
- the llustrated gpt-2: https://jalammar.github.io/illustrated-gpt2/
- how gpt3 works -visualizations and animations: https://jalammar.github.io/how-gpt3-works-visualizations-animations/
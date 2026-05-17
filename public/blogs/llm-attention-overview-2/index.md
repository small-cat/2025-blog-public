## multi-head attention (MHA)
多头注意力(Multi-Head Attention, MHA)是Transformer模型的原始注意力机制,其核心思 想是通过多个并行的注意力头,从不同子空间捕获输入序列中的多样化信息。

> Multi-head attention is a core Transformer component that runs multiple self-attention mechanisms (heads) in parallel to capture diverse, multi-faceted relationships between tokens, such as grammar, semantics, or long-range dependencies. Instead of one attention pass, it projects inputs into multiple subspaces to produce richer representations before concatenating and projecting them back.

MHA通过线性变换将输入向量投影到多个不同的子空间(注意力头),每个头独立计算注意力权重,然  后将所有头的输出拼接起来。这种设计使得模型能够同时关注不同类型的特征(如语义、语法、位置 等),从而增强表示能力。

**Formula:**  
$$\text{MultiHead}(Q,K,V)=\text{Concat}(\text{head}_{1},...,\text{head}_{h})W^{O}, 
where\ {head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$$  

![](/images/blog/mha.png)

### torch implementation
> https://github.com/rasbt/LLMs-from-scratch/blob/main/ch03/02_bonus_efficient-multihead-attention/mha-implementations.ipynb

```python
class MHA(nn.Module):
    def __init__(self, d_in, d_out, context_length, dropout, num_heads, qkv_bias=False):
        super().__init__()
        assert d_out % num_heads == 0, "d_out must be divisible by num_heads"

        self.d_out = d_out
        self.num_heads = num_heads
        self.head_dim = d_out // num_heads  # Reduce the projection dim to match desired output dim

        self.W_query = nn.Linear(d_in, d_out, bias=qkv_bias)
        self.W_key = nn.Linear(d_in, d_out, bias=qkv_bias)
        self.W_value = nn.Linear(d_in, d_out, bias=qkv_bias)
        self.out_proj = nn.Linear(d_out, d_out)  # Linear layer to combine head outputs
        self.dropout = nn.Dropout(dropout)
        self.register_buffer("mask", torch.triu(torch.ones(context_length, context_length), diagonal=1))

    def forward(self, x):
        b, num_tokens, d_in = x.shape # [B, S, d]

		# compute k q v 
        keys = self.W_key(x)  # Shape: (b, num_tokens, d_out)
        queries = self.W_query(x)
        values = self.W_value(x)

        # We implicitly split the matrix by adding a `num_heads` dimension
        # Unroll last dim: (b, num_tokens, d_out) -> (b, num_tokens, num_heads, head_dim)
        keys = keys.view(b, num_tokens, self.num_heads, self.head_dim)
        values = values.view(b, num_tokens, self.num_heads, self.head_dim)
        queries = queries.view(b, num_tokens, self.num_heads, self.head_dim)
        # keys:[b, s, n, d]
        # values: [b, s, n, d]
        # queries: [b, s, n, d]

        # Transpose: (b, num_tokens, num_heads, head_dim) -> (b, num_heads, num_tokens, head_dim)
        keys = keys.transpose(1, 2) # [b, n, s, d]
        queries = queries.transpose(1, 2) # [b, n, s, d]
        values = values.transpose(1, 2) # [b, n, s, d]
        # 变成 [b, n, s, d]，最后两个维度进行矩阵计算，相当于 n 和 head 一起计算

        # Compute scaled dot-product attention (aka self-attention) with a causal mask
        attn_scores = queries @ keys.transpose(2, 3)  # Dot product for each head

        # Original mask truncated to the number of tokens and converted to boolean
        mask_bool = self.mask.bool()[:num_tokens, :num_tokens]

        # Use the mask to fill attention scores
        attn_scores.masked_fill_(mask_bool, -torch.inf)

        attn_weights = torch.softmax(attn_scores / keys.shape[-1]**0.5, dim=-1)
        attn_weights = self.dropout(attn_weights)

        # Shape: (b, num_tokens, num_heads, head_dim)
        context_vec = (attn_weights @ values).transpose(1, 2)

        # Combine heads, where self.d_out = self.num_heads * self.head_dim
        context_vec = context_vec.contiguous().view(b, num_tokens, self.d_out)
        context_vec = self.out_proj(context_vec)  # optional projection

        return context_vec

mha_ch03 = MHA(
    d_in=embed_dim,
    d_out=embed_dim,
    context_length=context_len,
    dropout=0.0,
    num_heads=12,
    qkv_bias=False
).to(device)

out = mha_ch03(embeddings)
print(out.shape)
```

Multi-head attention combines knowledge of the same attention pooling via different representation subspaces of queries, keys, and values. **To compute multiple heads of multi-head attention in parallel, proper tensor manipulation is needed.**

## multi-query attention (MQA)
多查询注意力(Multi-Query Attention, MQA)是为解决MHA在长序列推理过程中KV缓存内存占用过高的问题而设计的优化机制。其核心思想是让所有查询头共享同一组键和值向量。

MQA保留了MHA中查询头的独立性,但让所有查询头共享同一组键和值矩阵。这种设计使得KV缓存的大小与头数无关,仅与序列长度和模型维度相关,从而显著降低了内存占用。

> https://www.intoai.pub/p/multi-query-attention

![](/images/blog/mqa.png)

Although the training benefits aren’t particularly significant, the real benefits become clear during inference, as the [KV cache](https://www.intoai.pub/p/llm-optimizations) size and required memory decrease significantly. This leads to much faster inference, especially for long sequences and large batch sizes, with little degradation in response quality.  **LLMs like [PaLM](https://arxiv.org/pdf/2204.02311) and [Falcon](https://arxiv.org/abs/2311.16867) use MQA instead of MHA.**

公式：
$$\text{Head}_{i}=\text{Attention}(Q_{i},K,V)=\text{softmax}\left(\frac{Q_{i}K^{\top }}{\sqrt{d_{k}}}\right)V$$
Where:

$$Q_{i}: \text{The i-th query head} (Q_i = XW_Q^i).$$
$$K, V: \text{The single shared key and value matrices, common to all heads.}$$
$$d_{k}: \text{The dimension of the key/query vectors used for scaling}$$

### implementation
```python
import torch
import torch.nn as nn
import math

class MultiQueryAttention(nn.Module):
  def __init__(self, embedding_dim, num_heads):
    super().__init__()

    # Check if embedding_dim is divisible by num_heads
    assert embedding_dim % num_heads == 0, "embedding_dim must be divisible by num_heads"

    # Embedding dimension
    self.embedding_dim = embedding_dim

    # Number of total heads
    self.num_heads = num_heads

    # Dimension of each head
    self.head_dim = embedding_dim // num_heads

    # Linear projection matrix for Query
    self.W_q = nn.Linear(embedding_dim, embedding_dim, bias = False)

    # Linear projection matrices for Key and Value
    self.W_k = nn.Linear(embedding_dim, self.head_dim, bias = False)
    self.W_v = nn.Linear(embedding_dim, self.head_dim, bias = False)

    # Linear projection matrix to produce final output
    self.W_o = nn.Linear(embedding_dim, embedding_dim, bias = False)

  # Splits Query into multiple heads
  def _split_heads(self, x):
    """
    Transforms input embeddings from
    [batch_size, sequence_length, embedding_dim]
    to
    [batch_size, num_heads, sequence_length, head_dim]
    """
    batch_size, sequence_length, embedding_dim = x.shape

    # Split embedding_dim into (num_heads, head_dim)
    x = x.reshape(batch_size, sequence_length, self.num_heads, self.head_dim)

    # Reorder and return the intended shape
    return x.transpose(1,2)

  # Merge heads back together
  def _merge_heads(self, x):
    """
    Transforms inputs from
    [batch_size, num_heads, sequence_length, head_dim]
    to
    [batch_size, sequence_length, embedding_dim]
    """
    batch_size, num_heads, sequence_length, head_dim = x.shape

    # Move sequence_length back before num_heads in the shape
    x = x.transpose(1,2)

    # Merge (num_heads, head_dim) back into embedding_dim
    embedding_dim = num_heads * head_dim
    x = x.reshape(batch_size, sequence_length, embedding_dim)

    return x

  # Forward pass
  def forward(self, x):
    batch_size, sequence_length, embedding_dim = x.shape

    # Compute Q, K, V
    Q = self.W_q(x) # [batch_size, sequence_length, embedding_dim]
    K = self.W_k(x) # [batch_size, sequence_length, head_dim]
    V = self.W_v(x) # [batch_size, sequence_length, head_dim]

    # Split Q into multiple heads
    Q = self._split_heads(Q) # [batch_size, num_heads, sequence_length, head_dim]

    # Add head dimension to K and V (Broadcast across all heads)
    K = K.unsqueeze(1) # [batch_size, 1, sequence_length, head_dim]
    V = V.unsqueeze(1) # [batch_size, 1, sequence_length, head_dim]

    # Calculate scaled dot-product attention
    attn_scores = Q @ K.transpose(-2, -1)
    attn_scores = attn_scores / math.sqrt(self.head_dim)

    # Create lower triangular matrix as causal masking
    causal_mask = torch.tril(torch.ones(sequence_length, sequence_length, device=x.device))
    # torch.tril 获得一个下三角矩阵，其余全部填充 0

    # Add batch_size and num_heads dimensions
    causal_mask = causal_mask.view(1, 1, sequence_length, sequence_length)

    # Mask out future positions by setting their scores to -inf
    attn_scores = attn_scores.masked_fill(causal_mask == 0, float('-inf'))

    # Apply softmax to get attention weights
    attn_weights = torch.softmax(attn_scores, dim = -1)

    # Multiply attention weights by V
    weighted_values = attn_weights @ V

    # Merge head outputs
    merged_heads_output = self._merge_heads(weighted_values)

    # Obtain final output
    output = self.W_o(merged_heads_output)

    return output
```

- Input embeddings are first projected into query (Q), key (K), and value (V) vectors
- The query vector is split across multiple attention heads
- The shared keys and values are broadcast across all head
- Each head computes scaled dot-product attention scores between Q and K
- A causal mask is applied to prevent the model from attending to future tokens
- Softmax converts the masked scores into attention weights
- Attention weights are used to compute a weighted sum of values (V)
- The outputs from all heads are merged into a single representation
- A final output projection matrix produces the layer’s output


triton kernel: https://github.com/kyegomez/MultiQueryAttention/blob/main/mqa/flash_attn_triton.py

## grouped query attention (GQA)
> https://arxiv.org/pdf/2305.13245
> https://github.com/rasbt/LLMs-from-scratch/blob/main/ch04/04_gqa/README.md

Grouped-query attention divides query heads into G groups, each of which shares a single key head and value head. GQA-G refers to grouped-query with G groups. GQA-1, with a single group and therefore single key and value head, is equivalent to MQA, while GQA-H, with groups equal to number of heads, is equivalent to MHA. Figure 2 shows a comparison of grouped-query attention and multihead/multi-query attention. When converting a multi-head checkpoint to a GQA checkpoint, we construct each group key and value head by meanpooling all the original heads within that group.

![](/images/blog/mha_gqa_mqa.png)

### implementation
> https://github.com/knotgrass/attention/blob/main/attn/attention.py
> https://github.com/fkodom/grouped-query-attention-pytorch

```python
class GroupedQueryAttention(nn.Module):
    def __init__(
            self, d_in, d_out, dropout, num_heads, num_kv_groups, dtype=None, qkv_bias=False
    ):
        super().__init__()
        assert d_out % num_heads == 0, "d_out must be divisible by num_heads"
        assert num_heads % num_kv_groups == 0, "num_heads must be divisible by num_kv_groups"

        self.d_out = d_out
        self.num_heads = num_heads
        self.head_dim = d_out // num_heads

        self.W_key = nn.Linear(d_in, num_kv_groups * self.head_dim, bias=qkv_bias, dtype=dtype)
        self.W_value = nn.Linear(d_in, num_kv_groups * self.head_dim, bias=qkv_bias, dtype=dtype)
        self.num_kv_groups = num_kv_groups
        self.group_size = num_heads // num_kv_groups

        self.W_query = nn.Linear(d_in, d_out, bias=qkv_bias, dtype=dtype)
        self.out_proj = nn.Linear(d_out, d_out, bias=False, dtype=dtype)
        self.dropout = nn.Dropout(dropout)

        self.register_buffer("cache_k", None, persistent=False)
        self.register_buffer("cache_v", None, persistent=False)
        self.ptr_current_pos = 0

    def forward(self, x, use_cache=False):
        b, num_tokens, _ = x.shape

        # Apply projections
        queries = self.W_query(x)  # (b, num_tokens, num_heads * head_dim)
        keys = self.W_key(x)       # (b, num_tokens, num_kv_groups * head_dim)
        values = self.W_value(x)   # (b, num_tokens, num_kv_groups * head_dim)

        # Reshape
        queries = queries.view(b, num_tokens, self.num_heads, self.head_dim).transpose(1, 2)
        keys_new = keys.view(b, num_tokens, self.num_kv_groups, self.head_dim).transpose(1, 2)
        values_new = values.view(b, num_tokens, self.num_kv_groups, self.head_dim).transpose(1, 2)

        if use_cache:
            if self.cache_k is None:
                self.cache_k, self.cache_v = keys_new, values_new
            else:
                self.cache_k = torch.cat([self.cache_k, keys_new], dim=2)
                self.cache_v = torch.cat([self.cache_v, values_new], dim=2)
            keys_base, values_base = self.cache_k, self.cache_v
        else:
            keys_base, values_base = keys_new, values_new
            if self.cache_k is not None or self.cache_v is not None:
                self.cache_k, self.cache_v = None, None
                self.ptr_current_pos = 0

        # Expand keys and values to match the number of heads
        # Shape: (b, num_heads, num_tokens, head_dim)
        keys = keys_base.repeat_interleave(self.group_size, dim=1)  # Shape: (b, num_heads, num_tokens, head_dim)
        values = values_base.repeat_interleave(self.group_size, dim=1)  # Shape: (b, num_heads, num_tokens, head_dim)
        # For example, before repeat_interleave along dim=1 (query groups):
        #   [K1, K2]
        # After repeat_interleave (each query group is repeated group_size times):
        #   [K1, K1, K2, K2]
        # If we used regular repeat instead of repeat_interleave, we'd get:
        #   [K1, K2, K1, K2]
        # 沿着 seq_len 轴 repeat group_size，变成 [b, n, s, d]，n 就是 num_heads，也就是 group_size * num_kv_groups

        # Compute scaled dot-product attention (aka self-attention) with a causal mask
        # Shape: (b, num_heads, num_tokens, num_tokens)
        attn_scores = queries @ keys.transpose(2, 3)  # Dot product for each head

        ####################################################
        # causal mask
        num_tokens_Q = queries.shape[-2]  # 经过了 transpose, [b, n, s, d]
        num_tokens_K = keys.shape[-2]
        device = queries.device
        if use_cache:
            q_positions = torch.arange(
                self.ptr_current_pos,
                self.ptr_current_pos + num_tokens_Q,
                device=device,
                dtype=torch.long,
            )
            self.ptr_current_pos += num_tokens_Q
        else:
            q_positions = torch.arange(num_tokens_Q, device=device, dtype=torch.long)
            self.ptr_current_pos = 0
        k_positions = torch.arange(num_tokens_K, device=device, dtype=torch.long)
        mask = q_positions.unsqueeze(-1) < k_positions.unsqueeze(0)

        # Use the mask to fill attention scores
        attn_scores = attn_scores.masked_fill(mask, -torch.inf)

        attn_weights = torch.softmax(attn_scores / keys.shape[-1]**0.5, dim=-1)
        assert keys.shape[-1] == self.head_dim
        attn_weights = self.dropout(attn_weights)

        # Shape: (b, num_tokens, num_heads, head_dim)
        context_vec = (attn_weights @ values).transpose(1, 2)

        # Combine heads, where self.d_out = self.num_heads * self.head_dim
        context_vec = context_vec.contiguous().view(b, num_tokens, self.d_out)
        context_vec = self.out_proj(context_vec)  # optional projection

        return context_vec

    def reset_cache(self):
        self.cache_k, self.cache_v = None, None
        self.ptr_current_pos = 0
```

GQA 是 MHA 与 MQA 的一种折中的做法，最佳性能(MQA)和最佳模型质量(MHA)之间的一个很好的权衡。不会像 MHA 一样，多个 head 每一个 head 都需要缓存 KV，使得 KV cache 的大小随着 head 的增加而成比例的增加太多，也不会与 MQA 一样所有的 head 共享一组 KV，使得模型精度下降太多。

## sliding window attention (SWA)
> https://sebastianraschka.com/llm-architecture-gallery/swa/
> https://arxiv.org/abs/2310.06825, Mistral 7B 使用了 GQA+SWA

Sliding window attention reduces the memory and compute cost of long-context inference by limiting how many previous tokens each position can attend to. Instead of attending to the entire prefix, each token only attends to a fixed window of recent tokens around its position. Because attention is restricted to a local token neighborhood, this mechanism is often referred to as local attention.

![](/images/blog/attn-swa.webp)

The conceptual shift is simple. Regular attention is global attention, while sliding-window attention is local attention. Global attention lets every token see the full prefix; SWA turns many of those layers into local attention layers.

非 SWA 每一个 token 都能看到前面所有的 token，而 SWA 看到的是包括自己在内的一个窗口内的 tokens。

In practice, saying that a model “uses SWA” does not mean it relies on SWA alone. What usually matters are the local-to-global layer pattern and the attention window size. The gallery includes several examples:

- Gemma 3 and Xiaomi use a 5:1 local-to-global pattern.
- OLMo 3 and Arcee Trinity use a 3:1 pattern.
- Xiaomi also uses a window size of 128, which is much smaller, and therefore more aggressive, than Gemma’s 1024.

SWA often appears together with [GQA](https://sebastianraschka.com/llm-architecture-gallery/gqa/) because the two ideas address different parts of the same inference problem. SWA reduces how much context a local layer has to consider. GQA reduces how much key-value state each token contributes to the cache.

That is why many recent dense models use both rather than treating them as alternatives. Gemma 3 is again a good reference point here, since it combines sliding window attention with grouped-query attention in the same architecture. [Mistral 7B](https://arxiv.org/pdf/2310.06825) also use GQA with SWA.

> https://zhuanlan.zhihu.com/p/687349083

![](/images/blog/mistral-7b-swa.png)

实际使用中，Mistral通过把SWA实现在FlashAttention和xFormers中，对于16k的上下文长度，获得了2倍的速度提升。
在不使用sliding window的情况下，随着自回归推理的进行，KV Cache是只增不减的。

而在使用SWA的情况下，超出窗口长度的kv就可以不用再缓存了，因此使用一个轮转替换的策略。

比如窗口大小  ，则当第5个token需要缓存是，直接替换掉第1个token，这样就可以保持kv缓存有一个最大值（为窗口大小），而不会无限增长。

![](/images/blog/mistral-7b-figure2.png)
![](/images/blog/mistral-7b-prefill-chunk.png)

这样便于我们估计硬件设备所能支持的throughput，也不会因为少量超长的case而造成堵塞，在工程上有利于提高硬件利用率，降低成本。

### implementation
> https://github.com/rasbt/LLMs-from-scratch/blob/main/ch04/06_swa/gpt_with_kv_swa.py

```python
class MultiHeadAttentionWithSWA(nn.Module):
    def __init__(self, d_in, d_out, dropout, num_heads, qkv_bias=False, sliding_window_size=None):
        super().__init__()
        assert d_out % num_heads == 0, "d_out must be divisible by num_heads"

        self.d_out = d_out
        self.num_heads = num_heads
        self.head_dim = d_out // num_heads  # Reduce the projection dim to match desired output dim

        self.W_query = nn.Linear(d_in, d_out, bias=qkv_bias)
        self.W_key = nn.Linear(d_in, d_out, bias=qkv_bias)
        self.W_value = nn.Linear(d_in, d_out, bias=qkv_bias)
        self.out_proj = nn.Linear(d_out, d_out)  # Linear layer to combine head outputs
        self.dropout = nn.Dropout(dropout)
        self.sliding_window_size = sliding_window_size

        ####################################################
        # KV cache-related code
        self.register_buffer("cache_k", None, persistent=False)
        self.register_buffer("cache_v", None, persistent=False)
        self.ptr_current_pos = 0
        ####################################################

    def forward(self, x, use_cache=False):
        b, num_tokens, d_in = x.shape

        keys_new = self.W_key(x)  # Shape: (b, num_tokens, d_out)
        values_new = self.W_value(x)
        queries = self.W_query(x)

        # We implicitly split the matrix by adding a `num_heads` dimension
        # Unroll last dim: (b, num_tokens, d_out) -> (b, num_tokens, num_heads, head_dim)
        keys_new = keys_new.view(b, num_tokens, self.num_heads, self.head_dim)
        values_new = values_new.view(b, num_tokens, self.num_heads, self.head_dim)
        queries = queries.view(b, num_tokens, self.num_heads, self.head_dim)

        ####################################################
        # KV cache-related
        if use_cache:
            old_cache_k, old_cache_v = self.cache_k, self.cache_v
            old_len = 0 if old_cache_k is None else old_cache_k.size(1)
            if old_cache_k is None:
                combined_k, combined_v = keys_new, values_new
            else:
                combined_k = torch.cat([old_cache_k, keys_new], dim=1)
                combined_v = torch.cat([old_cache_v, values_new], dim=1)

            keys, values = combined_k, combined_v
            if self.sliding_window_size is not None:
                # During chunked prefill we need up to W-1 older keys plus the whole
                # current chunk (so the earliest queries in the chunk keep their full
                # sliding-window context)
                # 看下上面图片的 prefill chunk 部分
                attn_keep = min(keys.size(1), self.sliding_window_size + num_tokens - 1)
                keys = keys[:, -attn_keep:, :, :]
                values = values[:, -attn_keep:, :, :]

                cache_keep = min(combined_k.size(1), self.sliding_window_size)
                self.cache_k = combined_k[:, -cache_keep:, :, :]
                self.cache_v = combined_v[:, -cache_keep:, :, :]
            else:
                self.cache_k, self.cache_v = combined_k, combined_v

            dropped = combined_k.size(1) - keys.size(1)
            k_start_pos_abs = (self.ptr_current_pos - old_len) + dropped
            q_start_pos_abs = self.ptr_current_pos
        else:
            keys, values = keys_new, values_new
        ####################################################

        # Transpose: (b, num_tokens, num_heads, head_dim) -> (b, num_heads, num_tokens, head_dim)
        keys = keys.transpose(1, 2)
        queries = queries.transpose(1, 2)
        values = values.transpose(1, 2)

        # Compute scaled dot-product attention (aka self-attention) with a causal mask
        attn_scores = queries @ keys.transpose(2, 3)  # Dot product for each head

        ####################################################
        # causal + sliding-window mask
        num_tokens_Q = queries.shape[-2]
        num_tokens_K = keys.shape[-2]
        device = queries.device
        # Determine absolute positions for q and k
        if use_cache:
            q_start = q_start_pos_abs
            k_start = k_start_pos_abs
        else:
            q_start = 0
            k_start = 0
        q_positions = torch.arange(q_start, q_start + num_tokens_Q, device=device, dtype=torch.long)
        k_positions = torch.arange(k_start, k_start + num_tokens_K, device=device, dtype=torch.long)
        # Sliding window width
        W = num_tokens_K + 1 if self.sliding_window_size is None else int(self.sliding_window_size)
        diff = q_positions.unsqueeze(-1) - k_positions.unsqueeze(0)
        mask_bool = (diff < 0) | (diff >= W)
        if use_cache:
            self.ptr_current_pos += num_tokens_Q
        else:
            self.ptr_current_pos = 0

        # Use the mask to fill attention scores
        attn_scores.masked_fill_(mask_bool, -torch.inf)

        attn_weights = torch.softmax(attn_scores / keys.shape[-1]**0.5, dim=-1)
        attn_weights = self.dropout(attn_weights)

        # Shape: (b, num_tokens, num_heads, head_dim)
        context_vec = (attn_weights @ values).transpose(1, 2)

        # Combine heads, where self.d_out = self.num_heads * self.head_dim
        context_vec = context_vec.contiguous().view(b, num_tokens, self.d_out)
        context_vec = self.out_proj(context_vec)  # optional projection

        return context_vec

    def reset_cache(self):
        self.cache_k, self.cache_v = None, None
        self.ptr_current_pos = 0
```


## 相关计算公式

$$sigmoid = \frac{1}{1 + e^{-x}}$$

$$silu = x * sigmoid$$

$$softmax = \frac{e^{x_i-max}}{\sum{e^{x_i-max}}}$$

$$RmsNorm = \frac{x_i}{\sqrt{\frac{1}{n}\sum{{x_i}^2} + \epsilon}} w + \gamma$$

$$Relu = max(0, x)$$

## 相关文献
1. [dive into deep learning](https://d2l.ai/index.html)
2. [The Big LLM Architecture Comparison](https://magazine.sebastianraschka.com/p/the-big-llm-architecture-comparison)
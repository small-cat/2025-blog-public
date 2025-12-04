## Program Representation
程序都是有 Pointer assignment 组成，分析是流不敏感的，不关心语句的执行顺序，所以 assignment 表达式可以是任何顺序的。
表达式和赋值的文法为

![Alt text](/images/blog/expression_assign_gramma.png)

每一个 allocation site 只有一个地址 $a_{malloc}$

对于一个变量 x，符号化的地址表示为$a_x$。也就是说，x 的地址 &x 的标准化形式为 $a_x$，而表达式 x 的标准化形式为 $*a_x$，*x 的标准化表示形式为 $**a_x$

$x = y \implies *a_x = *a_y \\
x = *y \implies *a_x = **a_y \\
*x = *y \implies **a_x = **a_y \\
*x = y \implies **a_x = *a_y$

算法的核心数据结构为 PEG (Pointer expressin graph)
- node 为 expression
- edge 为
  - Pointer dereference edges (D): for each dereference ∗ e, there is a D-edge from e to ∗ e. 
  - Assignment edges (A): for each assignment ∗ e1 := e2, there is an A-edge from e2 to ∗ e1.

赋值语句的文法形式就是一种， 

$s \rightarrow \ *e_1 := e_2$

e 就是 expression，可以是 deference expression *e，也可以是 address a

![](/images/blog/expression_assign_figure1.png)

同一水平线，表示指针之间的一种间接关系。
## Alias Analysis vid CFL-Reachability

![](/images/blog/memory_value_aliases.png)

内存别名和值别名计算，转换成在 PEG 上的边计算问题(a context-free language reachability problem)

![](/images/blog/memory_value_aliases_fig2.png)

example:
以 Figure 1 为例，计算 *x 与 *s 是否是内存别名 memory alias
1. y = &r 赋值语句表示 &r 与 y 是 value alias, &r 有一条指向 y 的有向边 edge，即 V(&r, y)
2. dereferences of y and &r 是 memory alias, M(r, *y)
3. s = r, 即 value r flows into s，即 V(r, s)
4. x = *y, 即 value *y flows into x，即 V(*y, x)
5. 因为 M(r, *y)，所以内存所指向的值应该是相同的，即 V(x, s)
6. 所以，解引用，M(*x, *s)

![](/images/blog/cfl_reachability1.png)

![](/images/blog/cfl_reachability22.png)

回过头再看下 CFL-reachability 问题的描述
CFL-reachability 问题描述：

对于一个带有 labeled edges 的 PEG(pointer expression graph)，如果 PEG 中的结点满足关系 R 就可以描述成一个 CFL-reachability 问题：
- 存在上下文无关文法 G
- PEG 中的结点 n 和 n' 满足关系 R 当且仅当
  - 存在一条路径能从 n 到达 n'
  - 沿着该路径上的边，边上的 labels 满足语言 L(G)
  - L(G) 由文法 G 生成
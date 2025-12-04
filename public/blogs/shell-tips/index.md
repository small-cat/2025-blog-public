## %% ##
```
file=/dir1/dir2/dir3/my.file.txt

可以用${ }分别替换得到不同的值：

${file#*/}：删掉第一个/ 及其左边的字符串：dir1/dir2/dir3/my.file.txt

${file##*/}：删掉最后一个/  及其左边的字符串：my.file.txt

${file#*.}：删掉第一个.  及其左边的字符串：file.txt

${file##*.}：删掉最后一个.  及其左边的字符串：txt

${file%/*}：删掉最后一个 /  及其右边的字符串：/dir1/dir2/dir3

${file%%/*}：删掉第一个/  及其右边的字符串：(空值)

${file%.*}：删掉最后一个 .  及其右边的字符串：/dir1/dir2/dir3/my.file

${file%%.*}：删掉第一个 .   及其右边的字符串：/dir1/dir2/dir3/my
```

## replace & substr
```
${file:0:5}：提取最左边的5 个字节：/dir1

${file:5:5}：提取第5 个字节右边的连续5个字节：/dir2

也可以对变量值里的字符串作替换：

${file/dir/path}：将第一个dir 替换为path：/path1/dir2/dir3/my.file.txt

${file//dir/path}：将全部dir 替换为path：/path1/path2/path3/my.file.txt
```

## assignment
```
${file-my.file.txt} ：假如$file 没有设定，则使用my.file.txt 作结果值。(空值及非空值时，不作处理) 

${file:-my.file.txt} ：假如$file 没有设定或为空值，則使用my.file.txt 作结果值。(非空值时，不作处理)

${file+my.file.txt} ：假如$file 设为空值或非空值，均使用my.file.txt 作结果值。(没设定时，不作处理)

${file:+my.file.txt} ：若$file 为非空值，則使用my.file.txt 作结果值。(没设定及空值时，不作处理)

${file=my.file.txt} ：若$file 没设定，则使用my.file.txt 作结果值，同时激昂$file 赋值为my.file.txt 。(空值及非空值时，不作处理)

${file:=my.file.txt} ：若$file 没设定或为空值，则使用my.file.txt 作结果值，同時将$file赋值为my.file.txt 。(非空值时，不作处理)

${file?my.file.txt} ：若$file 没设定，则将my.file.txt 输出至STDERR。(空值及非空值时，不作处理)

${file:?my.file.txt} ：若$file 没设定或为空值，则将my.file.txt 输出至STDERR。(非空值时，不作处理)
```

## length
`${#var}` 可计算出变量值的长度

## getopt
```
#!/bin/bash -e

ARGUMENT_LIST=(
"arg-one"
"arg-two"
"arg-three"
)


# read arguments
opts=$(getopt \
  --longoptions "$(printf "%s:," "${ARGUMENT_LIST[@]}")" \
  --name "$(basename "$0")" \
  --options "" \
  -- "$@"
)

eval set -- $opts

while [[ $# -gt 0  ]]; do
  echo "option: $1"
  case "$1" in
    --arg-one)
      argOne=$2
      shift 2
      ;;

    --arg-two)
      argTwo=$2
      shift 2
      ;;

    --arg-three)
      argThree=$2
      shift 2
      ;;

    --)
      break
      ;;
    *)
      echo "unrecognized options: $1"
      exit 0
      ;;
  esac
done
```

## block comment
```
方法一

: '
被注释的多行内容 
'
 

方法二

:<<eof
被注释的多行内容 
eof
 

方法三

:<<!
被注释的多行内容 
!
 

方法四

if false ; then 
   被注释的多行内容 
fi
```
# shadcn/ui 组件开发指南

## 核心原则

- 组件位置：`/client/src/components/ui/`
- 图标库：必须使用 `lucide-react`，禁用 Emoji
- 查阅源码实现：直接读取组件源码了解最新组件实现
- 交互系统：Button、Badge 使用 elevate 遮罩系统处理 hover/active 状态（通过 `::after` 伪元素叠加 `--elevate-1` / `--elevate-2`）

## 关键组件规范

#### 1. Button 组件

**导入路径**：`import { Button } from '@/components/ui/button'`

**Props**：
- `variant`: `"link" | "default" | "destructive" | "outline" | "secondary" | "ghost"` - 按钮样式变体

```tsx
// ✅ 使用变体
<Button variant="secondary">标准按钮</Button>

// ✅ 自定义颜色时必须配对前景色
<Button className="bg-primary text-primary-foreground">自定义按钮</Button>
```

#### 2. Badge 组件

**导入路径**：`import { Badge } from '@/components/ui/badge'`

**Props**：
- `variant`: `"default" | "destructive" | "outline" | "secondary"` - 样式变体

```tsx
// ✅ 使用变体
<Badge>默认</Badge>
<Badge variant="secondary">次要</Badge>
<Badge variant="outline">边框</Badge>
<Badge variant="destructive">危险</Badge>
```

#### 3. Alert 组件

**导入路径**：`import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/components/ui/alert'`

**Props**：
- `variant`: `"default" | "destructive" | "success" | "warning"` - 样式变体

```tsx
// ✅ default / destructive / success / warning 四种变体
<Alert variant="success">
  <CheckCircle className="size-4" />
  <AlertTitle>操作成功</AlertTitle>
  <AlertDescription>您的更改已保存</AlertDescription>
</Alert>

<Alert variant="warning">
  <AlertTriangle className="size-4" />
  <AlertTitle>警告</AlertTitle>
  <AlertDescription>请注意检查</AlertDescription>
</Alert>

```

#### 4. Empty 组件

**导入路径**：`import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'`

**子组件 Props**：
- `EmptyMedia` 组件的 `variant`: `"default" | "icon"` - 媒体展示方式

```tsx
// 标准结构：EmptyHeader 包含 EmptyMedia + EmptyTitle + EmptyDescription
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <SearchIcon className="size-6" />
    </EmptyMedia>
    <EmptyTitle>暂无数据</EmptyTitle>
    <EmptyDescription>当前没有找到相关内容</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>添加数据</Button>
  </EmptyContent>
</Empty>
```

#### 5. Card Padding 系统

**导入路径**：`import { CardHeader, CardContent, CardFooter } from '@/components/ui/card'`

- `CardHeader`: `p-6` (24px 全方向)
- `CardContent`: `p-6 pt-0` (与 header 无缝衔接)
- `CardFooter`: `p-6 pt-0` (与 content 无缝衔接)

#### 6. Dialog 组件

**导入路径**：`import { Dialog, DialogContent } from '@/components/ui/dialog'`

Dialog 默认提供了右上角的close能力，同时也提供了自定义关闭按钮的能力，即通过设置showCloseButton为false来关闭默认的关闭按钮。所以当默认存在close时，禁止在内容区域提供自定义的关闭按钮。

#### 7. Image 组件

**导入路径**：`import { Image } from '@/components/ui/image'`

**Props**：支持原生 `<img>` 标签所有属性。

```typescript
interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement>
```

**使用规范**：

1. **响应式图片场景**：当图片尺寸需要根据视口宽度变化时，必须设置 `sizes` 属性
2. **固定尺寸图片场景**：当图片有固定尺寸时，必须设置 `width` 属性（number 类型）
3. **必须提供有意义的 `alt` 属性**

```tsx
// ✅ 响应式图片
<Image
  src="/path/to/image.jpg"
  alt="描述文字"
  sizes="(max-width: 768px) 100vw, 50vw"
/>

// ✅ 固定尺寸图片（width/height 使用 number）
<Image
  src="/path/to/image.jpg"
  alt="描述文字"
  width={300}
  height={200}
/>

```

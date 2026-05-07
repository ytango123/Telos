import Link from "next/link";
import { BookOpen, Sparkles, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="text-xl font-semibold">Telos</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/blocks">
              <Button variant="ghost">我的学习</Button>
            </Link>
            <Link href="/blocks/new">
              <Button>开始学习</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            AI 驱动的
            <br />
            <span className="text-primary">定制化学习平台</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            告诉我们你想学什么，AI 将为你生成完整的学习课程。
            <br />
            不再需要到处找资料，开箱即学。
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/blocks/new">
              <Button size="lg" className="gap-2">
                <Sparkles className="h-5 w-5" />
                创建学习任务
              </Button>
            </Link>
            <Link href="/blocks">
              <Button size="lg" variant="outline">
                查看我的学习
              </Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Target className="h-8 w-8" />}
              title="目标驱动"
              description="设定你的学习目标，AI 会根据目标深度定制内容，无论是快速了解还是深入研究。"
            />
            <FeatureCard
              icon={<Zap className="h-8 w-8" />}
              title="异步生成"
              description="提交学习任务后，后台 AI 自动工作。你可以去做其他事情，完成后收到通知。"
            />
            <FeatureCard
              icon={<BookOpen className="h-8 w-8" />}
              title="开箱即学"
              description="生成的课程拥有专业的章节布局，支持代码高亮、数学公式，直接开始学习。"
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Telos - AI 驱动的定制化学习交付平台</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border p-6 hover:shadow-md transition-shadow">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

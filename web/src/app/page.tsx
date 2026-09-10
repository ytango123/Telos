import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Compass,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Approach />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="motion-spring flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          Telos
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/blocks">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              我的学习
            </Button>
          </Link>
          <Link href="/blocks?new=1">
            <Button size="sm" className="motion-spring press-tactile gap-1.5 shadow-[var(--shadow-soft-1)]">
              开始
              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft radial wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-[0.45]"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, var(--accent-sky) 0%, transparent 70%)",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-24 pt-20 sm:px-8 sm:pt-28 md:grid-cols-12 md:gap-10 md:pb-32">
        <div className="md:col-span-7 md:pr-6">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-emerald)]" />
            正在内测 · 早期版本
          </p>
          <h1 className="text-[2.25rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            把模糊的想学，
            <br />
            <span className="text-foreground/70">变成可以打开就读的课程。</span>
          </h1>
          <p className="mt-5 max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
            描述一个问题，给一些素材，Telos 编排章节、抓取参考、整理图与视频，
            把碎片拼成一门属于你的课。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/blocks?new=1">
              <Button
                size="lg"
                className="motion-spring press-tactile h-11 gap-1.5 shadow-[var(--shadow-soft-3)]"
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                创建第一个任务
              </Button>
            </Link>
            <Link href="/blocks">
              <Button
                size="lg"
                variant="ghost"
                className="motion-spring h-11 gap-1 text-muted-foreground hover:text-foreground"
              >
                查看我的学习
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </Button>
            </Link>
          </div>
        </div>

        {/* Asymmetric preview tile — composed, not generic 3 cards */}
        <div className="md:col-span-5">
          <PreviewTile />
        </div>
      </div>
    </section>
  );
}

function PreviewTile() {
  return (
    <div className="relative rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[var(--shadow-soft-3)] backdrop-blur">
      <div className="absolute inset-x-5 -top-px h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono">课程预览</span>
        <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--accent-emerald)] [animation:ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
      </div>

      <div className="mt-3 space-y-2.5">
        <p className="text-[13px] font-medium tracking-tight">Python 装饰器</p>
        <ul className="space-y-1.5 text-[12px]">
          {[
            "第一章 · 从函数即对象说起",
            "第二章 · 闭包与作用域",
            "第三章 · 装饰器的基本写法",
            "第四章 · 带参数装饰器 / 类装饰器",
            "第五章 · 标准库与实战案例",
          ].map((t, i) => (
            <li
              key={t}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-muted-foreground"
              style={{
                animation: `telos-dialog-in 520ms var(--ease-spring) both`,
                animationDelay: `${i * 70 + 120}ms`,
              }}
            >
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="truncate">{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3 w-3" strokeWidth={1.75} />
          5 章节 · 约 22 分钟
        </span>
        <span className="font-mono text-foreground/70">Deep Learning</span>
      </div>
    </div>
  );
}

function Approach() {
  return (
    <section className="mx-auto max-w-6xl border-t border-border/50 px-5 py-20 sm:px-8 sm:py-24">
      <div className="grid gap-12 md:grid-cols-12">
        <div className="md:col-span-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            How it works
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            三个动作，
            <br />
            一门课就成型。
          </h2>
        </div>
        <div className="md:col-span-8">
          <ol className="divide-y divide-border/60">
            <Step
              n="01"
              icon={<Compass className="h-4 w-4" strokeWidth={1.5} />}
              title="提出问题"
              desc="把你想学的事说清楚 —— 背景、目标、深度，越具体越好。"
            />
            <Step
              n="02"
              icon={<Layers className="h-4 w-4" strokeWidth={1.5} />}
              title="给点素材（可选）"
              desc="文件、文本笔记、网页链接、视频，AI 会优先采纳这些确定来源。"
            />
            <Step
              n="03"
              icon={<Sparkles className="h-4 w-4" strokeWidth={1.5} />}
              title="生成与阅读"
              desc="后台编排章节并撰写内容，完成后回来阅读，支持代码、公式、图与视频。"
            />
          </ol>
        </div>
      </div>
    </section>
  );
}

function Step({
  n,
  icon,
  title,
  desc,
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="motion-spring grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-2 py-5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground">{n}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-foreground/70">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-medium tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/50 px-5 py-6 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>Telos · AI 驱动的定制化学习</span>
        <span className="font-mono">v0.1 · internal</span>
      </div>
    </footer>
  );
}

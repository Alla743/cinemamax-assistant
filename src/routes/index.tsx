import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Film, Usb, HardDrive, Coins, RefreshCw, Trash2, FolderOpen, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سينماكس ستور — نظام نسخ الأفلام والمسلسلات" },
      { name: "description", content: "تطبيق كشك سينماكس ستور: كشف فوري لفلاشات الزبائن، حساب الحجم والسعر بالريال اليمني تلقائياً." },
    ],
  }),
  component: Index,
});

/* Electron bridge typing */
declare global {
  interface Window {
    cinemaxAPI?: {
      isElectron: true;
      onDriveAttached: (cb: (drive: DriveInfo) => void) => void;
      onDriveDetached: (cb: (drivePath: string) => void) => void;
      scanDrive: (drivePath: string) => Promise<ScanResult>;
      listDrives: () => Promise<DriveInfo[]>;
    };
    showDirectoryPicker?: (opts?: object) => Promise<FileSystemDirectoryHandle>;
  }
}

type DriveInfo = { path: string; label: string; size: number };
type ScanResult = { fileCount: number; totalBytes: number; sampleFiles: string[] };
type HistoryEntry = {
  id: string;
  at: string;
  label: string;
  gb: number;
  pricePerGb: number;
  total: number;
};

function Index() {
  const isElectron = typeof window !== "undefined" && !!window.cinemaxAPI;
  const [pricePerGb, setPricePerGb] = useState<number>(() => {
    if (typeof window === "undefined") return 150;
    return Number(localStorage.getItem("cinemax.pricePerGb") || 150);
  });
  const [scan, setScan] = useState<{ label: string; bytes: number; files: number } | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("cinemax.history") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("cinemax.pricePerGb", String(pricePerGb));
  }, [pricePerGb]);

  useEffect(() => {
    localStorage.setItem("cinemax.history", JSON.stringify(history.slice(0, 50)));
  }, [history]);

  /* Auto USB detection (Electron only) */
  useEffect(() => {
    if (!isElectron || !window.cinemaxAPI) return;
    const api = window.cinemaxAPI;
    api.onDriveAttached(async (drive) => {
      toast.success(`تم اكتشاف فلاشة: ${drive.label}`);
      setWaiting(false);
      const result = await api.scanDrive(drive.path);
      setScan({ label: drive.label, bytes: result.totalBytes, files: result.fileCount });
    });
    api.onDriveDetached(() => {
      toast.info("تم فصل الفلاشة");
      setWaiting(true);
      setScan(null);
    });
  }, [isElectron]);

  const gb = scan ? scan.bytes / (1024 ** 3) : 0;
  const total = useMemo(() => Math.round(gb * pricePerGb), [gb, pricePerGb]);

  async function manualPick() {
    if (!window.showDirectoryPicker) {
      toast.error("متصفحك لا يدعم اختيار المجلدات. استخدم النسخة المثبتة على ويندوز.");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker();
      let bytes = 0;
      let files = 0;
      async function walk(dir: FileSystemDirectoryHandle) {
        for await (const [, entry] of (dir as any).entries()) {
          if (entry.kind === "file") {
            const f = await entry.getFile();
            bytes += f.size;
            files++;
          } else if (entry.kind === "directory") {
            await walk(entry);
          }
        }
      }
      toast.loading("جاري فحص الملفات...", { id: "scan" });
      await walk(handle);
      toast.success("اكتمل الفحص", { id: "scan" });
      setWaiting(false);
      setScan({ label: handle.name, bytes, files });
    } catch (e) {
      // user cancelled
    }
  }

  function confirmInvoice() {
    if (!scan) return;
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      label: scan.label,
      gb: Number(gb.toFixed(2)),
      pricePerGb,
      total,
    };
    setHistory([entry, ...history]);
    toast.success(`تم حفظ الفاتورة: ${total.toLocaleString("ar")} ريال`);
    setScan(null);
    setWaiting(true);
  }

  function reset() {
    setScan(null);
    setWaiting(true);
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <Toaster position="top-center" richColors dir="rtl" />

      {/* Header */}
      <header className="mx-auto mb-8 flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground glow-primary">
            <Film className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gradient-gold leading-tight">سينماكس ستور</h1>
            <p className="text-xs text-muted-foreground">نظام نسخ الأفلام والمسلسلات</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-2 border-primary/30 px-3 py-1.5 text-xs">
          <span className={`h-2 w-2 rounded-full ${isElectron ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"}`} />
          {isElectron ? "تطبيق ويندوز — الكشف التلقائي مفعل" : "وضع المعاينة في المتصفح"}
        </Badge>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* LEFT — main detection & invoice */}
        <div className="space-y-6">
          {/* Detection status card */}
          <Card className="overflow-hidden border-primary/20">
            <CardContent className="p-0">
              {waiting && !scan ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <div className="relative mb-6 rounded-full bg-primary/10 p-6 pulse-ring">
                    <Usb className="h-12 w-12 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">في انتظار توصيل الفلاشة...</h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    {isElectron
                      ? "أدخل فلاشة الزبون أو وصّل هاتفه عبر USB، وسيتم الكشف والحساب فوراً."
                      : "في وضع المتصفح، اضغط الزر أدناه لاختيار المجلد يدوياً. النسخة المثبتة على ويندوز تكتشف الفلاشة تلقائياً."}
                  </p>
                  {!isElectron && (
                    <Button onClick={manualPick} size="lg" className="mt-6 gap-2">
                      <FolderOpen className="h-5 w-5" />
                      اختر مجلد الفلاشة يدوياً
                    </Button>
                  )}
                </div>
              ) : scan ? (
                <div className="p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-lg bg-[var(--color-success)]/15 p-2">
                      <CheckCircle2 className="h-6 w-6 text-[var(--color-success)]" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">تم الكشف عن</p>
                      <p className="text-lg font-bold">{scan.label}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat icon={<HardDrive className="h-5 w-5" />} label="الحجم الإجمالي" value={`${gb.toFixed(2)} GB`} />
                    <Stat icon={<Film className="h-5 w-5" />} label="عدد الملفات" value={scan.files.toLocaleString("ar")} />
                    <Stat icon={<Coins className="h-5 w-5" />} label="سعر الجيجا" value={`${pricePerGb} ر.ي`} />
                  </div>

                  <Separator className="my-6" />

                  <div className="rounded-xl bg-primary/10 p-6 text-center glow-primary">
                    <p className="text-sm font-medium text-muted-foreground">الإجمالي المستحق</p>
                    <p className="mt-2 text-5xl font-extrabold text-gradient-gold">
                      {total.toLocaleString("ar")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-primary">ريال يمني</p>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button onClick={confirmInvoice} size="lg" className="flex-1 gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      تأكيد وحفظ الفاتورة
                    </Button>
                    <Button onClick={reset} variant="outline" size="lg" className="gap-2">
                      <RefreshCw className="h-4 w-4" />
                      إلغاء
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Notice for browser users */}
          {!isElectron && (
            <Card className="border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5">
              <CardContent className="flex items-start gap-3 p-4 text-sm">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" />
                <p className="text-muted-foreground">
                  هذه معاينة في المتصفح. للحصول على <strong className="text-foreground">الكشف التلقائي الفوري</strong> للفلاشات،
                  حمّل نسخة ويندوز <code className="rounded bg-muted px-1.5 py-0.5">.exe</code> من صفحة الإصدارات على GitHub.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT — settings + history */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="h-5 w-5 text-primary" /> إعدادات التسعير
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="price" className="text-sm">سعر الجيجابايت الواحد (ريال يمني)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                value={pricePerGb}
                onChange={(e) => setPricePerGb(Math.max(0, Number(e.target.value)))}
                className="h-12 text-lg font-bold"
              />
              <p className="text-xs text-muted-foreground">يتم حفظ السعر تلقائياً على هذا الجهاز.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">آخر الفواتير</CardTitle>
              {history.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setHistory([])} className="h-8 text-xs">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[320px] px-4 pb-4">
                {history.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">لا توجد فواتير بعد</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-lg border bg-card/50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{h.label}</span>
                          <span className="font-bold text-primary">{h.total.toLocaleString("ar")} ر.ي</span>
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                          <span>{h.gb} GB × {h.pricePerGb}</span>
                          <span>{new Date(h.at).toLocaleString("ar")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="mx-auto mt-10 max-w-6xl text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} سينماكس ستور — جميع الحقوق محفوظة
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card/40 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

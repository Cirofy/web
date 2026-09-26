"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { usePageReady } from "@/lib/use-page-ready";
import {
  teamRoleHints,
  teamRoleLabels,
  type TeamRole,
} from "@/lib/types/team";
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { roleAccessSummary } from "@/lib/nav-access";

type Member = {
  id: string;
  fullName: string;
  email: string;
  role: TeamRole;
  status: "active" | "pending";
};

const MATRIX_ROLES = ["owner", "ops", "finance", "agency"] as const;

export default function TeamPage() {
  const ready = usePageReady();
  const [members, setMembers] = useState<Member[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [inviteRole, setInviteRole] = useState<TeamRole>("ops");
  
  const load = async () => {
    if (!getToken()) return;
    try {
      const res = await apiFetch<{
        members: Member[];
        counts?: { active: number; pending: number };
      }>("/team");
      if (res.members?.length) {
        setMembers(
          res.members.map((m) => ({
            id: m.id,
            fullName: m.fullName,
            email: m.email,
            role: m.role,
            status: m.status,
          })),
        );
        setFromApi(true);
      }
    } catch {
      // ekip yüklenemedi — boş kalır
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    return {
      active: members.filter((m) => m.status === "active").length,
      pending: members.filter((m) => m.status === "pending").length,
    };
  }, [members]);

  function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const fullName = String(form.get("fullName") || "").trim() || email;
    if (!email) return;
    if (members.some((m) => m.email === email)) {
      toast("Bu e-posta zaten ekipte.");
      return;
    }

    void (async () => {
      if (getToken() && inviteRole !== "owner") {
        try {
          const res = await apiFetch<{
            id: string;
            fullName: string;
            email: string;
            role: TeamRole;
            status: "pending";
            message: string;
            inviteToken?: string;
            acceptPath?: string;
          }>("/team/invite", {
            method: "POST",
            body: JSON.stringify({
              email,
              fullName,
              role: inviteRole,
            }),
          });
          setMembers((prev) => [
            ...prev,
            {
              id: res.id,
              fullName: res.fullName,
              email: res.email,
              role: res.role,
              status: "pending",
            },
          ]);
          toast(
            res.acceptPath
              ? `${res.message} Kayıt linki: ${res.acceptPath}`
              : res.message,
          );
          e.currentTarget.reset();
          setInviteRole("ops");
          return;
        } catch (err) {
          toast({ message: err instanceof Error ? err.message : "Davet gönderilemedi.", tone: "loss" });
          return;
        }
      }

      setMembers((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          fullName,
          email,
          role: inviteRole,
          status: "pending",
        },
      ]);
      toast(`Davet eklendi (yerel): ${email} · ${teamRoleLabels[inviteRole]}`);
      e.currentTarget.reset();
      setInviteRole("ops");
    })();
  }

  function setRole(id: string, role: TeamRole) {
    void (async () => {
      if (getToken() && fromApi) {
        try {
          const res = await apiFetch<{ message: string }>(`/team/${id}/role`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
          });
          setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
          toast(res.message);
          return;
        } catch (err) {
          toast({ message: err instanceof Error ? err.message : "Rol güncellenemedi.", tone: "loss" });
          return;
        }
      }
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
      toast({ message: "Rol güncellendi.", tone: "profit" });
    })();
  }

  function removeMember(id: string) {
    const m = members.find((x) => x.id === id);
    if (!m || m.role === "owner") return;

    void (async () => {
      if (getToken() && fromApi) {
        try {
          const res = await apiFetch<{ message: string }>(`/team/${id}`, {
            method: "DELETE",
          });
          setMembers((prev) => prev.filter((x) => x.id !== id));
          toast(res.message);
          return;
        } catch (err) {
          toast({ message: err instanceof Error ? err.message : "Üye çıkarılamadı.", tone: "loss" });
          return;
        }
      }
      setMembers((prev) => prev.filter((x) => x.id !== id));
      toast(`${m.fullName} ekipten çıkarıldı.`);
    })();
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Ekip"
      description="Operasyon, finans ve ajans görünürlükleri — kim neyi görür."
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Rol izin matrisi</CardTitle>
              <CardDescription>
                Davet ederken hangi rolün hangi panellere erişeceği — tarife yetkisi
                ayrı işaretlenir. Sahip her şeyi görür.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {MATRIX_ROLES.map((role) => {
                  const summary = roleAccessSummary(role);
                  return (
                    <div
                      key={role}
                      className="rounded-xl border border-border p-4"
                    >
                      <div className="font-semibold">{summary.label}</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {teamRoleHints[role]}
                      </p>
                      <div className="mt-3">
                        <Badge
                          tone={
                            summary.tariffAccess === "apply"
                              ? "profit"
                              : summary.tariffAccess === "view"
                                ? "warn"
                                : "default"
                          }
                        >
                          {summary.tariffLabel}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {summary.all ? (
                          <Badge tone="profit">Tüm paneller</Badge>
                        ) : (
                          summary.labels.slice(0, 8).map((label) => (
                            <Badge key={label} tone="default">
                              {label}
                            </Badge>
                          ))
                        )}
                        {!summary.all && summary.labels.length > 8 ? (
                          <Badge tone="default">
                            +{summary.labels.length - 8}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Üye</div>
                <div className="mt-1 font-display text-2xl font-bold">{members.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Aktif</div>
                <div className="mt-1 font-display text-2xl font-bold text-profit">
                  {counts.active}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Bekleyen davet</div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {counts.pending}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(teamRoleLabels) as TeamRole[]).map((role) => (
              <Card key={role}>
                <CardContent className="p-4">
                  <div className="font-semibold">{teamRoleLabels[role]}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{teamRoleHints[role]}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Üyeler</CardTitle>
                <CardDescription>Rol değişiklikleri kaydedilir.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{m.fullName}</span>
                        <Badge tone={m.status === "active" ? "profit" : "warn"}>
                          {m.status === "active" ? "Aktif" : "Davet"}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">
                        {m.email}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {m.role === "owner" ? (
                        <Badge>{teamRoleLabels.owner}</Badge>
                      ) : (
                        <Select
                          value={m.role}
                          onValueChange={(v) => setRole(m.id, v as TeamRole)}
                        >
                          <SelectTrigger className="w-36" aria-label="Rol">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(teamRoleLabels) as TeamRole[])
                              .filter((r) => r !== "owner")
                              .map((r) => (
                                <SelectItem key={r} value={r}>
                                  {teamRoleLabels[r]}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                      {m.role !== "owner" ? (
                        <Button size="sm" variant="outline" onClick={() => removeMember(m.id)}>
                          Çıkar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Davet et</CardTitle>
                <CardDescription>Davet e-posta ile gider; kayıt linki ve kod da burada görünür.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={onInvite}>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fullName">
                      Ad soyad
                    </label>
                    <input
                      id="fullName"
                      name="fullName"
                      placeholder="Örn. Ayşe Operasyon"
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="email">
                      E-posta
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      placeholder="kisi@firma.com"
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="role">
                      Rol
                    </label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) => setInviteRole(v as TeamRole)}
                    >
                      <SelectTrigger id="role" aria-label="Davet rolü">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(teamRoleLabels) as TeamRole[])
                          .filter((r) => r !== "owner")
                          .map((r) => (
                            <SelectItem key={r} value={r}>
                              {teamRoleLabels[r]}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{teamRoleHints[inviteRole]}</p>
                  </div>
                  <Button type="submit">Davet gönder</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

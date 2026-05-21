"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Shield, UserCog } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { SelectField } from "@/components/select-field";
import { api } from "@/lib/api";

interface AdminUser {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  role: "owner" | "admin" | "editor";
  createdAt: string;
}

const roleOptions = [
  { value: "owner", label: "owner" },
  { value: "admin", label: "admin" },
  { value: "editor", label: "editor" }
];

export default function UsersPage() {
  return (
    <AuthGate>
      <AppShell>
        <UsersAdmin />
      </AppShell>
    </AuthGate>
  );
}

function UsersAdmin() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/users") });
  const update = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminUser["role"] }) =>
      api(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] })
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-focus">Доступ</p>
        <h1 className="mt-2 text-3xl font-black sm:text-5xl">Администраторы</h1>
      </header>

      {users.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-100">
          <AlertTriangle size={18} />
          Не удалось загрузить список администраторов.
        </div>
      ) : null}

      <section className="panel overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserCog className="text-focus" size={20} />
          <h2 className="text-xl font-black">Команда</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              <tr>
                <th className="px-3 py-3">Пользователь</th>
                <th className="px-3 py-3">Telegram ID</th>
                <th className="px-3 py-3">Роль</th>
                <th className="px-3 py-3">Создан</th>
              </tr>
            </thead>
            <tbody>
              {users.isLoading ? (
                <tr>
                  <td className="px-3 py-8 text-center text-zinc-500" colSpan={4}>
                    Загружаем команду...
                  </td>
                </tr>
              ) : (users.data ?? []).length ? (
                users.data?.map((user) => (
                  <tr key={user.id} className="border-t border-white/10">
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-focus/15 text-focus">
                          <Shield size={17} />
                        </div>
                        <div>
                          <div className="font-bold">{user.username ? `@${user.username}` : user.firstName ?? "Admin"}</div>
                          <div className="text-zinc-500">{user.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4">{user.telegramId}</td>
                    <td className="px-3 py-4">
                      <SelectField
                        className="max-w-36"
                        value={user.role}
                        options={roleOptions}
                        disabled={update.isPending}
                        onChange={(value) => update.mutate({ id: user.id, role: value as AdminUser["role"] })}
                      />
                    </td>
                    <td className="px-3 py-4 text-zinc-500">{new Date(user.createdAt).toLocaleDateString("ru-RU")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-8 text-center text-zinc-500" colSpan={4}>
                    Администраторов пока нет. Первый разрешенный Telegram ID станет владельцем.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api("/admin/auth/me"),
    retry: false
  });

  useEffect(() => {
    if (me.isError) {
      router.push("/login");
    }
  }, [me.isError, router]);

  if (me.isLoading) {
    return <div className="grid min-h-screen place-items-center text-zinc-400">Загрузка FullFocus...</div>;
  }

  if (me.isError) {
    return null;
  }

  return children;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/utils/supabase";
import { authLocaleJa } from "@/lib/auth-locale-ja";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) router.replace("/");
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) router.replace("/");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md rounded-lg bg-zinc-900 border border-zinc-700 p-6">
        <h1 className="text-lg font-medium text-white mb-4 text-center">麻雀スコアアプリ</h1>
        <Auth
          supabaseClient={supabase}
          localization={{ variables: authLocaleJa }}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: "#22c55e",
                  brandAccent: "#16a34a",
                  brandButtonText: "white",
                  inputBackground: "#27272a",
                  inputBorder: "#3f3f46",
                  inputText: "#fafafa",
                  inputPlaceholder: "#a1a1aa",
                },
              },
            },
          }}
          providers={[]}
          onlyThirdPartyProviders={false}
          redirectTo={`${typeof window !== "undefined" ? window.location.origin : ""}/`}
        />
      </div>
    </div>
  );
}

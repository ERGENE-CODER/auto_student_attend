"use client";

import Link from "next/link";
import { createClient } from "./lib/supabase/client";
const supabase = createClient();
export default function Home() {
  return (
    <main className="min-h-screen w-full bg-[url('/image2.png')] bg-cover bg-center bg-no-repeat">

      <div className="min-h-screen w-full flex flex-col justify-end items-center px-4 pb-10 bg-black/20">

        <div className="w-full max-w-sm text-center">

          <h1 className="text-3xl font-bold text-white mb-2">
            Auto Attendance System
          </h1>

          <p className="text-sm text-white mb-8">
            Smart Bluetooth Attendance System
          </p>

          <div className="bg-white/20 backdrop-blur-lg rounded-3xl p-5 space-y-4">

            <Link
              href="/register"
              className="flex items-center justify-center w-full min-h-[60px] rounded-2xl bg-blue-600 text-white text-[20px] font-semibold hover:bg-gray-50 hover:text-black transition-colors"
            >
              Register
            </Link>

            <Link
              href="/login"
              className="flex items-center justify-center w-full min-h-[60px] rounded-2xl bg-blue-600 text-white text-[20px] font-semibold hover:bg-gray-50 hover:text-black transition-colors"
            >
              Login
            </Link>

          </div>

        </div>

      </div>

    </main>
  );
}
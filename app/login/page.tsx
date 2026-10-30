"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  Lock,
  Hash,
  Eye,
  EyeOff,
  GraduationCap,
  LogIn,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "../lib/supabase/client";

// ======================================================
// DEMO / REVIEWER ACCOUNTS
// ======================================================
//
// These Student IDs skip the Android device verification,
// so a reviewer can log in on any phone without registering.
// Real students are NOT affected.
//

const DEMO_ACCOUNT = {
  studentId: "20008",
  password: "kalisa", // replace with the password you set in Supabase
};

const DEMO_STUDENT_IDS = [DEMO_ACCOUNT.studentId];

// ======================================================
// DETECT NATIVE CAPACITOR APP
// ======================================================
//
// true  = Android/iOS Capacitor app
// false = normal browser such as Chrome on PC
//

function isNativeCapacitorApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const capacitor = (
    window as Window & {
      Capacitor?: {
        isNativePlatform?: () => boolean;
      };
    }
  ).Capacitor;

  return Boolean(capacitor?.isNativePlatform?.());
}

// ======================================================
// LOGIN PAGE
// ======================================================

export default function LoginPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    studentId: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // true after the reviewer taps "Use Demo Account"
  const [demoFilled, setDemoFilled] = useState(false);

  // ====================================================
  // HANDLE INPUT CHANGES
  // ====================================================

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setDemoFilled(false);
  };

  // ====================================================
  // HANDLE LOGIN
  // ====================================================

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");

    const studentId = formData.studentId.trim();

    if (!studentId) {
      setError("Please enter your Student ID.");
      return;
    }

    if (!formData.password) {
      setError("Please enter your password.");
      return;
    }

    if (isLoggingIn) {
      return;
    }

    setIsLoggingIn(true);

    const supabase = createClient();

    try {
      const nativeApp = isNativeCapacitorApp();
      const isDemoAccount = DEMO_STUDENT_IDS.includes(studentId);

      console.log("STUDENT LOGIN STARTED");
      console.log("Student ID:", studentId);
      console.log(
        "Environment:",
        nativeApp ? "NATIVE CAPACITOR / ANDROID" : "PC / WEB BROWSER"
      );

      // ==================================================
      // STEP 1: FIND STUDENT EMAIL
      // ==================================================

      const { data: studentEmail, error: studentLookupError } =
        await supabase.rpc("get_student_email", {
          p_student_id: studentId,
        });

      if (studentLookupError) {
        console.error("STUDENT EMAIL LOOKUP ERROR:", studentLookupError);

        setError("Unable to check your student account. Please try again.");

        return;
      }

      if (!studentEmail) {
        console.log("No student found for Student ID:", studentId);

        setError("Student ID or password is incorrect.");

        return;
      }

      // ==================================================
      // STEP 2: REAL SUPABASE PASSWORD LOGIN
      // ==================================================

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: studentEmail,
          password: formData.password,
        });

      if (authError) {
        console.error("SUPABASE AUTH LOGIN ERROR:", authError);

        setError("Student ID or password is incorrect.");

        return;
      }

      // ==================================================
      // STEP 3: VERIFY REAL SUPABASE SESSION
      // ==================================================

      if (!authData.user || !authData.session) {
        console.error("Login returned no user or session.");

        setError("Login could not be completed. Please try again.");

        return;
      }

      console.log("✅ SUPABASE AUTHENTICATION SUCCESSFUL");
      console.log("Auth User ID:", authData.user.id);

      // ==================================================
      // PC / WEB  OR  DEMO ACCOUNT
      // ==================================================
      //
      // No device verification:
      //   - PC / browser users never need a device key.
      //   - Demo (reviewer) accounts can use any phone.
      //
      // ==================================================

      if (!nativeApp || isDemoAccount) {
        console.log(
          isDemoAccount
            ? "Demo account: skipping device verification."
            : "PC / Web login: skipping device verification."
        );

        router.push("/home");

        return;
      }

      // ==================================================
      // ANDROID ONLY FROM THIS POINT (real students)
      // ==================================================

      console.log("📱 ANDROID DEVICE VERIFICATION");

      // STEP 4: GET THIS PHONE'S DEVICE ID

      const localDeviceId = localStorage.getItem("autoattendance_device_id");

      console.log("Local Android device ID:", localDeviceId);

      if (!localDeviceId || localDeviceId.trim() === "") {
        console.error("This Android phone has no registered device ID.");

        await supabase.auth.signOut();

        setError("This device is not registered for this account.");

        return;
      }

      // STEP 5: CHECK student_devices

      const { data: deviceRecord, error: deviceLookupError } = await supabase
        .from("student_devices")
        .select(
          `
            id,
            auth_user_id,
            device_id,
            public_key,
            device_name,
            platform,
            is_active
          `
        )
        .eq("auth_user_id", authData.user.id)
        .eq("device_id", localDeviceId)
        .eq("is_active", true)
        .maybeSingle();

      if (deviceLookupError) {
        console.error("DEVICE LOOKUP ERROR:", deviceLookupError);

        await supabase.auth.signOut();

        setError("Unable to verify this device. Please try again.");

        return;
      }

      if (!deviceRecord) {
        console.error("❌ ANDROID DEVICE NOT REGISTERED");
        console.error("Account:", authData.user.id);
        console.error("Phone device ID:", localDeviceId);

        await supabase.auth.signOut();

        setError("This device is not registered for this account.");

        return;
      }

      console.log("✅ REGISTERED ANDROID DEVICE FOUND");
      console.log("Device ID:", deviceRecord.device_id);
      console.log("Device name:", deviceRecord.device_name);
      console.log("Platform:", deviceRecord.platform);
      console.log("Device active:", deviceRecord.is_active);

      // STEP 6: DEVICE CHECK PASSED → HOME

      console.log("✅ ANDROID DEVICE VERIFICATION PASSED");

      router.push("/home");
    } catch (loginError) {
      console.error("UNEXPECTED LOGIN ERROR:", loginError);

      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error("Could not sign out after login failure:", signOutError);
      }

      setError("Something went wrong during login. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ======================================================
  // PAGE
  // ======================================================

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="w-full max-w-md mx-auto">
        {/* HEADER */}

        <div className="relative flex items-center justify-center mb-8">
          <Link
            href="/"
            className="absolute left-0 p-2.5 rounded-xl hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </Link>

          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">Student Login</h1>

            <p className="text-xs text-gray-500 mt-1">
              Sign in to your Auto Attendance account
            </p>
          </div>
        </div>

        {/* WELCOME CARD */}

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 mb-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-blue-600" />
            </div>

            <h2 className="text-lg font-bold text-gray-900">Welcome Back</h2>

            <p className="text-xs text-gray-500 mt-2 max-w-xs leading-5">
              Sign in to access your attendance dashboard, attendance history
              and student profile.
            </p>
          </div>
        </div>

        {/* DEMO ACCOUNT (FOR APP REVIEWERS) */}

        <div className="bg-blue-600 rounded-3xl shadow-sm p-5 mb-5">
          <h2 className="text-sm font-bold text-white">Demo Account</h2>

          <p className="text-xs text-blue-100 mt-1 leading-5">
            For app reviewers: no registration needed. Tap the button to fill
            the login details below.
          </p>

          <div className="mt-3 bg-blue-700/60 rounded-xl px-4 py-3 text-xs text-white space-y-1">
            <p>
              <span className="text-blue-200">Student ID:</span>{" "}
              <span className="font-semibold">{DEMO_ACCOUNT.studentId}</span>
            </p>
            <p>
              <span className="text-blue-200">Password:</span>{" "}
              <span className="font-semibold">{DEMO_ACCOUNT.password}</span>
            </p>
          </div>

          <button
            type="button"
            disabled={isLoggingIn}
            onClick={() => {
              setFormData({
                studentId: DEMO_ACCOUNT.studentId,
                password: DEMO_ACCOUNT.password,
              });
              setError("");
              setDemoFilled(true);
            }}
            className={`mt-3 w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${
              demoFilled
                ? "bg-blue-900 text-white"
                : "bg-white text-black font-bold  hover:bg-blue-900 hover:text-white active:bg-blue-900 active:text-white"
            }`}
          >
            {demoFilled ? "Demo details filled ✓" : "Use Demo Account"}
          </button>
        </div>

        {/* LOGIN FORM */}

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-5"
        >
          <div>
            <h2 className="text-sm font-bold text-gray-900">Account Access</h2>

            <p className="text-xs text-gray-400 mt-1">
              Enter your student credentials below.
            </p>
          </div>

          {/* STUDENT ID */}

          <div>
            <label
              htmlFor="studentId"
              className="block text-xs font-semibold text-gray-700 mb-2"
            >
              Student ID
            </label>

            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

              <input
                id="studentId"
                name="studentId"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                value={formData.studentId}
                onChange={handleChange}
                placeholder="Enter your Student ID"
                disabled={isLoggingIn}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-60"
              />
            </div>
          </div>

          {/* PASSWORD */}

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-gray-700 mb-2"
            >
              Password
            </label>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                disabled={isLoggingIn}
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                disabled={isLoggingIn}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* FORGOT PASSWORD */}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setError("Password recovery will be connected later.")}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <p className="text-xs font-medium text-red-600 leading-5">
                {error}
              </p>
            </div>
          )}

          {/* LOGIN BUTTON */}

          <button
            type="submit"
            disabled={isLoggingIn}
            className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              isLoggingIn
                ? "bg-blue-400 text-white cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99]"
            }`}
          >
            {isLoggingIn ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Checking Account...
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Login
              </>
            )}
          </button>

          {/* REGISTRATION LINK */}

          <div className="text-center pt-1">
            <p className="text-xs text-gray-500">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-semibold text-blue-600 hover:underline"
              >
                Create account
              </Link>
            </p>
          </div>
        </form>

        {/* SECURITY NOTE */}

        <div className="flex items-center justify-center gap-2 mt-6">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />

          <p className="text-[10px] text-gray-400">
            Your account information is securely protected.
          </p>
        </div>
      </div>
    </main>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { registerPlugin } from "@capacitor/core";

import {
  ArrowLeft,
  User,
  Mail,
  Lock,
  GraduationCap,
  Hash,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";

import { createClient } from "../lib/supabase/client";

// ============================================================
// DEVICE KEY PLUGIN
// ============================================================

type DeviceKeyPlugin = {
  generate: () => Promise<{
    deviceId: string;
    publicKey: string;
    deviceName: string;
    platform: string;
  }>;

  delete: (options: { deviceId: string }) => Promise<void>;
};

const DeviceKey = registerPlugin<DeviceKeyPlugin>("DeviceKey");

// ============================================================
// DETECT NATIVE CAPACITOR APP
// ============================================================

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

// ============================================================
// TYPES
// ============================================================

// One row of the "classes" table (only the columns we need).
type ClassRow = {
  program: string;
  year_of_course: string | number;
};

// ============================================================
// REGISTRATION PAGE
// ============================================================

export default function RegistrationPage() {
  const supabase = useMemo(() => createClient(), []);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Classes created by the admin (loaded from Supabase)
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    studentId: "",
    email: "",
    program: "",
    yearOfCourse: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [emailConfirmationRequired, setEmailConfirmationRequired] =
    useState(false);

  // ============================================================
  // LOAD CLASSES FROM SUPABASE
  // ============================================================

  useEffect(() => {
    let cancelled = false;

    async function loadClasses() {
      setClassesLoading(true);
      setClassesError("");

      const { data, error: loadError } = await supabase
        .from("classes")
        .select("program, year_of_course");

      if (cancelled) return;

      if (loadError) {
        console.error("Could not load classes:", loadError);
        setClassesError(
          "Could not load programs. Check your connection and try again."
        );
        setClasses([]);
      } else {
        setClasses((data ?? []) as ClassRow[]);
      }

      setClassesLoading(false);
    }

    loadClasses();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Unique programs that have at least one class.
  const programs = useMemo(
    () =>
      Array.from(
        new Set(
          classes
            .map((c) => (c.program ?? "").trim())
            .filter((p) => p.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [classes]
  );

  // Years available for the selected program.
  const years = useMemo(() => {
    if (!formData.program) return [];

    return Array.from(
      new Set(
        classes
          .filter((c) => (c.program ?? "").trim() === formData.program)
          .map((c) => String(c.year_of_course).trim())
          .filter((y) => /^\d+$/.test(y))
      )
    ).sort((a, b) => Number(a) - Number(b));
  }, [classes, formData.program]);

  // ============================================================
  // HANDLE INPUT CHANGES
  // ============================================================

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  };

  // When the program changes, the year must be chosen again.
  const handleProgramChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    setFormData((previous) => ({
      ...previous,
      program: value,
      yearOfCourse: "",
    }));

    setError("");
  };

  // ============================================================
  // DELETE UNUSED DEVICE KEY
  // ============================================================

  async function cleanupDevice(nativeApp: boolean, deviceId: string | null) {
    if (!nativeApp) return;

    localStorage.removeItem("autoattendance_device_id");

    if (deviceId) {
      try {
        await DeviceKey.delete({ deviceId });
      } catch (cleanupError) {
        console.warn("Could not delete unused device key:", cleanupError);
      }
    }
  }

  // ============================================================
  // REGISTRATION
  // ============================================================

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setError("");

    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.studentId.trim() ||
      !formData.email.trim() ||
      !formData.program ||
      !formData.yearOfCourse ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      setError("Please complete all required fields.");
      return;
    }

    if (!/^\d+$/.test(formData.studentId.trim())) {
      setError("Student ID must contain numbers only.");
      return;
    }

    // The program and year must match a class created by the admin.
    const classExists = classes.some(
      (c) =>
        (c.program ?? "").trim() === formData.program &&
        String(c.year_of_course).trim() === formData.yearOfCourse
    );

    if (!classExists) {
      setError(
        "This program and year is not available. Please select again."
      );
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const nativeApp = isNativeCapacitorApp();

    let generatedDeviceId: string | null = null;
    let devicePublicKey: string | null = null;
    let deviceName: string | null = null;
    let devicePlatform: string | null = null;

    try {
      // STEP 1: GENERATE DEVICE KEY ON ANDROID ONLY

      if (nativeApp) {
        const device = await DeviceKey.generate();

        generatedDeviceId = device.deviceId;
        devicePublicKey = device.publicKey;
        deviceName = device.deviceName;
        devicePlatform = device.platform;

        localStorage.setItem("autoattendance_device_id", device.deviceId);
      }

      // STEP 2: CREATE SUPABASE AUTH ACCOUNT
      // The database triggers will:
      //   1. create the row in "students" (handle_new_student)
      //   2. link the student to the matching class (assign_student_to_class)

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            student_id: formData.studentId.trim(),
            first_name: formData.firstName.trim(),
            last_name: formData.lastName.trim(),
            program: formData.program,

            // Read by handle_new_student and saved as students.year_of_study
            year_of_course: formData.yearOfCourse,

            // ANDROID DEVICE INFORMATION
            ...(nativeApp
              ? {
                  device_id: generatedDeviceId,
                  device_public_key: devicePublicKey,
                  device_name: deviceName,
                  device_platform: devicePlatform,
                }
              : {}),
          },
        },
      });

      // STEP 3: HANDLE AUTHENTICATION ERROR

      if (signUpError) {
        await cleanupDevice(nativeApp, generatedDeviceId);

        const message = signUpError.message.toLowerCase();

        if (
          message.includes("already registered") ||
          message.includes("already been registered")
        ) {
          setError("An account with this email already exists.");
        } else {
          setError(signUpError.message);
        }

        return;
      }

      // STEP 4: CONFIRM USER WAS CREATED

      if (!data.user) {
        await cleanupDevice(nativeApp, generatedDeviceId);

        setError("The account could not be created. Please try again.");

        return;
      }

      // STEP 5: REGISTRATION SUCCESS

      if (!data.session) {
        setEmailConfirmationRequired(true);
      }

      setSuccess(true);
    } catch (err) {
      console.error("Unexpected registration error:", err);

      await cleanupDevice(nativeApp, generatedDeviceId);

      const message = err instanceof Error ? err.message : String(err);

      setError(`Registration error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // SUCCESS PAGE
  // ============================================================

  if (success) {
    const selectedYear = formData.yearOfCourse;

    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-7 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-5">
              <CheckCircle2 className="w-11 h-11 text-emerald-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900">
              Registration Complete
            </h1>

            {emailConfirmationRequired ? (
              <p className="text-sm text-gray-500 mt-3 leading-6">
                Your student account has been created. Please check your
                email and confirm your account before logging in.
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-3 leading-6">
                Your student account has been created successfully.
              </p>
            )}

            <div className="mt-6 bg-gray-50 rounded-2xl p-4 text-left">
              <p className="text-xs text-gray-400 mb-1">Student</p>
              <p className="text-sm font-semibold text-gray-900">
                {formData.firstName} {formData.lastName}
              </p>

              <p className="text-xs text-gray-400 mt-4 mb-1">Student ID</p>
              <p className="text-sm font-semibold text-gray-900">
                {formData.studentId}
              </p>

              <p className="text-xs text-gray-400 mt-4 mb-1">Email</p>
              <p className="text-sm font-semibold text-gray-900 break-all">
                {formData.email}
              </p>

              <p className="text-xs text-gray-400 mt-4 mb-1">Programme</p>
              <p className="text-sm font-semibold text-gray-900">
                {formData.program}
              </p>

              <p className="text-xs text-gray-400 mt-4 mb-1">Year of Course</p>
              <p className="text-sm font-semibold text-gray-900">
                Year {selectedYear}
              </p>
            </div>

            <Link
              href="/login"
              className="mt-6 flex items-center justify-center w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
            >
              Continue to Login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // REGISTRATION FORM
  // ============================================================

  const noClassesAvailable =
    !classesLoading && !classesError && programs.length === 0;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="w-full max-w-md mx-auto">
        {/* HEADER */}

        <div className="relative flex items-center justify-center mb-6">
          <Link
            href="/"
            className="absolute left-0 p-2.5 rounded-xl hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </Link>

          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">
              Student Registration
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Create your Auto Attendance account
            </p>
          </div>
        </div>

        {/* BRAND */}

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-blue-600" />
            </div>

            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Auto Attendance System
              </h2>
              <p className="text-xs text-gray-500 mt-1 leading-5">
                Register once to access attendance, history and your student
                profile.
              </p>
            </div>
          </div>
        </div>

        {/* FORM */}

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-5"
        >
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              Personal Information
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Enter your official student details.
            </p>
          </div>

          {/* FIRST NAME */}

          <div>
            <label
              htmlFor="firstName"
              className="block text-xs font-semibold text-gray-700 mb-2"
            >
              First Name
            </label>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="firstName"
                name="firstName"
                type="text"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="Enter your first name"
                disabled={loading}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
              />
            </div>
          </div>

          {/* LAST NAME */}

          <div>
            <label
              htmlFor="lastName"
              className="block text-xs font-semibold text-gray-700 mb-2"
            >
              Last Name
            </label>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="lastName"
                name="lastName"
                type="text"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Enter your last name"
                disabled={loading}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
              />
            </div>
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
                value={formData.studentId}
                onChange={handleChange}
                placeholder="e.g. 20260023"
                disabled={loading}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
              />
            </div>
          </div>

          {/* EMAIL */}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-gray-700 mb-2"
            >
              Email
            </label>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter valid email address"
                disabled={loading}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
              />
            </div>
          </div>

          {/* PROGRAMME (loaded from the classes table) */}

          <div>
            <label
              htmlFor="program"
              className="block text-xs font-semibold text-gray-700 mb-2"
            >
              Programme
            </label>

            <div className="relative">
              <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                id="program"
                name="program"
                value={formData.program}
                onChange={handleProgramChange}
                disabled={loading || classesLoading || programs.length === 0}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none disabled:opacity-60"
              >
                <option value="">
                  {classesLoading
                    ? "Loading programs..."
                    : "Select your program"}
                </option>
                {programs.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>
            </div>

            {classesError && (
              <p className="text-[10px] text-red-600 mt-1.5">
                {classesError}
              </p>
            )}

            {noClassesAvailable && (
              <p className="text-[10px] text-amber-600 mt-1.5">
                No programs are available yet. Please contact your
                administrator.
              </p>
            )}
          </div>

          {/* YEAR OF COURSE (depends on the selected program) */}

          <div>
            <label
              htmlFor="yearOfCourse"
              className="block text-xs font-semibold text-gray-700 mb-2"
            >
              Year of Course
            </label>

            <select
              id="yearOfCourse"
              name="yearOfCourse"
              value={formData.yearOfCourse}
              onChange={handleChange}
              disabled={loading || !formData.program}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
            >
              <option value="">
                {formData.program
                  ? "Select year of study"
                  : "Select a program first"}
              </option>
              {years.map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </select>

            <p className="text-[10px] text-gray-400 mt-1.5">
              Only years with an active class are shown.
            </p>
          </div>

          {/* SECURITY */}

          <div className="pt-3 border-t border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">
              Account Security
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Create a secure password for your account.
            </p>
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
                value={formData.password}
                onChange={handleChange}
                placeholder="Create a password"
                disabled={loading}
                required
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                disabled={loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 disabled:opacity-50"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            <p className="text-[10px] text-gray-400 mt-1.5">
              Minimum 6 characters.
            </p>
          </div>

          {/* CONFIRM PASSWORD */}

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-semibold text-gray-700 mb-2"
            >
              Confirm Password
            </label>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                disabled={loading}
                required
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword((previous) => !previous)
                }
                disabled={loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 disabled:opacity-50"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <p className="text-xs font-medium text-red-600">{error}</p>
            </div>
          )}

          {/* SUBMIT */}

          <button
            type="submit"
            disabled={loading || classesLoading || programs.length === 0}
            className="w-full py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:scale-[0.99] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Creating Account..." : "Create Student Account"}
          </button>

          {/* LOGIN */}

          <p className="text-center text-xs text-gray-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-blue-600 hover:underline"
            >
              Login
            </Link>
          </p>
        </form>

        {/* FOOTER */}

        <p className="text-center text-[10px] text-gray-400 mt-5 px-6 leading-5">
          By creating an account, you agree to use the Auto Attendance system
          responsibly.
        </p>
      </div>
    </main>
  );
}
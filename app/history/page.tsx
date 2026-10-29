"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/app/lib/supabase/client";

import {
  Home as HomeIcon,
  Clock,
  User,
  Calendar,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

// ======================================================
// TYPES
// ======================================================

interface StudentProfile {
  student_id: string;
  First_name: string;
  Second_name: string | null;
  email: string | null;
  Program: string | null;
  auth_user_id: string;
}

interface AttendanceRecord {
  id?: string | number;
  student_id?: string;
  student_name?: string;
  course_name?: string;
  teacher_name?: string;
  room?: string;
  status?: string;
  token?: string;
  created_at?: string;
}

// ======================================================
// PAGE
// ======================================================

export default function HistoryPage() {

  const [activetab, setactivetab] = useState("history");
  const supabase = createClient();

  // ====================================================
  // STUDENT
  // ====================================================

  const [student, setStudent] =
    useState<StudentProfile | null>(null);

  const [studentLoading, setStudentLoading] =
    useState(true);

  // ====================================================
  // FILTER
  // ====================================================

  const [filter, setFilter] =
    useState("All");

  // ====================================================
  // ATTENDANCE DATA
  // ====================================================

  const [records, setRecords] =
    useState<AttendanceRecord[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  // ====================================================
  // LOAD CURRENT STUDENT
  // ====================================================

  const loadStudent = async () => {
    try {
      setStudentLoading(true);
      setError("");

      console.log(
        "================================="
      );

      console.log(
        "LOADING CURRENT STUDENT"
      );

      console.log(
        "================================="
      );

      // ----------------------------------------------
      // Get logged-in Auth user
      // ----------------------------------------------

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error(
          "AUTH USER ERROR:",
          authError
        );

        throw new Error(
          "Unable to verify the logged-in account."
        );
      }

      if (!user) {
        throw new Error(
          "You are not logged in."
        );
      }

      console.log(
        "Auth User ID:",
        user.id
      );

      // ----------------------------------------------
      // Get student profile
      // ----------------------------------------------

      const {
        data: studentData,
        error: studentError,
      } = await supabase
        .from("students")
        .select(
          "student_id,First_name,Second_name,email,Program,auth_user_id"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (studentError) {
        console.error(
          "STUDENT PROFILE ERROR:",
          studentError
        );

        throw new Error(
          "Unable to load your student profile."
        );
      }

      if (!studentData) {
        throw new Error(
          "Student profile was not found."
        );
      }

      console.log(
        "✅ CURRENT STUDENT:",
        studentData
      );

      setStudent(
        studentData as StudentProfile
      );

    } catch (err) {
      console.error(
        "FAILED TO LOAD STUDENT:",
        err
      );

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          "Unable to load student profile."
        );
      }

      setStudent(null);

    } finally {
      setStudentLoading(false);
    }
  };

  // ====================================================
  // LOAD ATTENDANCE HISTORY
  // ====================================================

  const loadAttendanceHistory =
    async () => {
      try {
        setLoading(true);
        setError("");

        console.log(
          "Loading attendance history..."
        );

        // ----------------------------------------------
        // Make sure we know the current student
        // ----------------------------------------------

        let currentStudent =
          student;

        if (!currentStudent) {
          const {
            data: { user },
            error: authError,
          } =
            await supabase.auth.getUser();

          if (authError) {
            throw new Error(
              "Unable to verify your login session."
            );
          }

          if (!user) {
            throw new Error(
              "You are not logged in."
            );
          }

          const {
            data: studentData,
            error: studentError,
          } =
            await supabase
              .from("students")
              .select(
                "student_id,First_name,Second_name,email,Program,auth_user_id"
              )
              .eq(
                "auth_user_id",
                user.id
              )
              .single();

          if (studentError) {
            throw new Error(
              "Unable to load your student profile."
            );
          }

          currentStudent =
            studentData as StudentProfile;

          setStudent(
            currentStudent
          );
        }

        // ----------------------------------------------
        // Load only this student's attendance
        // ----------------------------------------------

        const {
          data,
          error: supabaseError,
        } = await supabase
          .from("attendance")
          .select("*")
          .eq(
            "student_id",
            currentStudent.student_id
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (supabaseError) {
          console.error(
            "ATTENDANCE HISTORY ERROR:",
            supabaseError
          );

          throw new Error(
            supabaseError.message
          );
        }

        console.log(
          "✅ ATTENDANCE HISTORY:",
          data
        );

        setRecords(
          (data || []) as AttendanceRecord[]
        );

      } catch (err) {
        console.error(
          "FAILED TO LOAD ATTENDANCE HISTORY:",
          err
        );

        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(
            "Unable to load attendance history."
          );
        }

        setRecords([]);

      } finally {
        setLoading(false);
      }
    };

  // ====================================================
  // INITIAL LOAD
  // ====================================================

  useEffect(() => {
    const initialize = async () => {
      await loadStudent();
    };

    initialize();
  }, []);

  // ====================================================
  // LOAD HISTORY AFTER STUDENT
  // ====================================================

  useEffect(() => {
    if (
      studentLoading ||
      !student
    ) {
      return;
    }

    loadAttendanceHistory();
  }, [
    studentLoading,
    student,
  ]);

  // ====================================================
  // FILTER RECORDS
  // ====================================================

  const filteredRecords =
    useMemo(() => {
      if (filter === "All") {
        return records;
      }

      if (filter === "Present") {
        return records.filter(
          (record) =>
            (record.status || "")
              .trim()
              .toUpperCase() ===
            "PRESENT"
        );
      }

      if (filter === "Absent") {
        return records.filter(
          (record) =>
            (record.status || "")
              .trim()
              .toUpperCase() ===
            "ABSENT"
        );
      }

      return records;
    }, [
      records,
      filter,
    ]);

  // ====================================================
  // FORMAT DATE
  // ====================================================

  const formatDateTime = (
    value?: string
  ) => {
    if (!value) {
      return "Date unavailable";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return value;
    }

    return date.toLocaleString(
      undefined,
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
  };

  // ====================================================
  // STATUS HELPER
  // ====================================================

  const normalizedStatus = (
    status?: string
  ) =>
    (status || "")
      .trim()
      .toUpperCase();

  // ====================================================
  // LOADING STUDENT
  // ====================================================

  if (studentLoading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">

        <div className="text-center">

          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />

          <p className="text-sm font-semibold text-gray-700">
            Loading your account...
          </p>

          <p className="text-xs text-gray-400 mt-2">
            Please wait.
          </p>

        </div>

      </main>
    );
  }

  // ====================================================
  // STUDENT / AUTH ERROR
  // ====================================================

  if (!student) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-5">

        <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-sm p-6 text-center">

          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">

            <XCircle className="w-10 h-10 text-red-500" />

          </div>

          <h1 className="text-lg font-bold text-gray-900">
            Account Not Found
          </h1>

          <p className="text-xs text-gray-500 mt-2 leading-5">
            {error ||
              "We could not load your student account."}
          </p>

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center w-full py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-bold"
          >
            Go to Login
          </Link>

        </div>

      </main>
    );
  }

  // ====================================================
  // STUDENT NAME
  // ====================================================

  const studentFullName =
    `${student.First_name} ${
      student.Second_name ?? ""
    }`.trim();

  // ====================================================
  // UI
  // ====================================================

  return (
    <main className="bg-gray-50 min-h-screen w-full relative pb-24">

      {/* ==================================================
          HEADER
      ================================================== */}

      <div className="flex items-center justify-between py-6 px-5 bg-white border-b border-gray-100">

        <Link
          href="/home"
          className="p-2 rounded-xl hover:bg-blue-50 transition-colors"
        >
          <ChevronLeft className="w-6 h-6 stroke-[2.5] text-black" />
        </Link>

        <h1 className="text-[20px] font-bold text-gray-900">
          Attendance History
        </h1>

         <Link
          href="/profile"
          className="p-2 rounded-xl hover:bg-blue-50 transition-colors"
        >
          <ChevronRight className="w-6 h-6 stroke-[2.5] text-black" />
        </Link>

        <button
          onClick={loadAttendanceHistory}
          className="p-2 text-gray-800 hover:text-blue-600 cursor-pointer"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <RefreshCw className="w-6 h-6" />
          )}
        </button>

      </div>

      {/* ==================================================
          FILTER BUTTONS
      ================================================== */}

      <section className="flex items-center justify-center gap-2 px-5 py-5">

        <button
          onClick={() =>
            setFilter("All")
          }
          className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
            filter === "All"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white text-black border border-gray-200"
          }`}
        >
          All
        </button>

        <button
          onClick={() =>
            setFilter("Present")
          }
          className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
            filter === "Present"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white text-black border border-gray-200"
          }`}
        >
          Present
        </button>

        <button
          onClick={() =>
            setFilter("Absent")
          }
          className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
            filter === "Absent"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white text-black border border-gray-200"
          }`}
        >
          Absent
        </button>

      </section>

      {/* ==================================================
          SUMMARY
      ================================================== */}

      <section className="px-5 mb-4">

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-xs text-gray-400 font-medium">
                Student
              </p>

              <p className="text-sm font-bold text-gray-900">
                {studentFullName}
              </p>

              <p className="text-[11px] text-gray-500">
                ID: {student.student_id}
              </p>

              {student.Program && (
                <p className="text-[11px] text-gray-500">
                  {student.Program}
                </p>
              )}

            </div>

            <div className="text-right">

              <p className="text-xs text-gray-400">
                Records
              </p>

              <p className="text-lg font-bold text-blue-600">
                {filteredRecords.length}
              </p>

            </div>

          </div>

        </div>

      </section>

      {/* ==================================================
          CONTENT
      ================================================== */}

      <section className="px-5 space-y-4">

        {/* ERROR */}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">

            <p className="text-sm font-bold text-red-700 mb-1">
              Unable to load attendance history
            </p>

            <p className="text-xs text-red-600 break-words">
              {error}
            </p>

            <button
              onClick={loadAttendanceHistory}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold"
            >
              Try Again
            </button>

          </div>
        )}

        {/* NO RECORDS */}

        {!loading &&
          !error &&
          filteredRecords.length === 0 && (

            <div className="flex flex-col items-center justify-center text-center py-16">

              <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-5">

                <Calendar className="w-12 h-12 text-blue-500" />

              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-1">

                No{" "}
                {filter === "All"
                  ? ""
                  : filter.toLowerCase() + " "}
                records

              </h3>

              <p className="text-xs text-gray-500 max-w-xs">

                {filter === "All"
                  ? "Your attendance records will appear here after you mark attendance."
                  : `There are no ${filter.toLowerCase()} attendance records yet.`}

              </p>

            </div>

          )}

        {/* ATTENDANCE RECORDS */}

        {!loading &&
          !error &&
          filteredRecords.map(
            (record, index) => {

              const status =
                normalizedStatus(
                  record.status
                );

              const isPresent =
                status === "PRESENT";

              return (
                <div
                  key={
                    record.id ??
                    `${record.course_name}-${record.created_at}-${index}`
                  }
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
                >

                  {/* DATE */}

                  <div className="flex items-center justify-between mb-3">

                    <p className="text-[11px] font-medium text-gray-400">
                      {formatDateTime(
                        record.created_at
                      )}
                    </p>

                    {/* STATUS */}

                    {isPresent ? (

                      <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full">

                        <CheckCircle2 className="w-3.5 h-3.5" />

                        <span className="text-[11px] font-bold">
                          Present
                        </span>

                      </div>

                    ) : (

                      <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1.5 rounded-full">

                        <XCircle className="w-3.5 h-3.5" />

                        <span className="text-[11px] font-bold">
                          Absent
                        </span>

                      </div>

                    )}

                  </div>

                  {/* COURSE */}

                  <div className="mb-3">

                    <p className="text-[11px] text-gray-400 font-medium">
                      Course
                    </p>

                    <p className="text-base font-bold text-gray-900">
                      {record.course_name ||
                        "Unknown course"}
                    </p>

                  </div>

                  {/* TEACHER */}

                  <div className="mb-3">

                    <p className="text-[11px] text-gray-400 font-medium">
                      Teacher
                    </p>

                    <p className="text-sm font-semibold text-gray-700">
                      {record.teacher_name ||
                        "Unknown teacher"}
                    </p>

                  </div>

                  {/* ROOM */}

                  <div className="mb-3">

                    <p className="text-[11px] text-gray-400 font-medium">
                      Location
                    </p>

                    <p className="text-sm font-semibold text-gray-700">
                      {record.room ||
                        "Location unavailable"}
                    </p>

                  </div>

                  {/* TOKEN */}

                  {record.token && (

                    <div className="pt-3 border-t border-gray-100">

                      <p className="text-[11px] text-gray-400 font-medium">
                        Attendance Token
                      </p>

                      <p className="text-xs font-mono font-bold text-gray-600 break-all mt-1">
                        {record.token}
                      </p>

                    </div>

                  )}

                </div>
              );
            }
          )}

      </section>

      {/* ==================================================
          BOTTOM NAVIGATION
      ================================================== */}

      <section className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4 flex justify-around items-center z-40">

        <Link
          href="/home"
          className="flex flex-col items-center gap-1 text-gray-400 hover:text-blue-600"
        >
          <HomeIcon className="w-5 h-5" />

          <span className="text-[11px] font-semibold">
            Home
          </span>
        </Link>

        <Link
            href="/history"
               className={
               activetab === "history"
                ? "flex flex-col items-center gap-1 text-blue-600"
                : "flex flex-col items-center gap-1 text-gray-400 hover:text-blue-600"
                 }
        >
          <Clock className="w-5 h-5" />

          <span className="text-[11px] font-semibold">
            History
          </span>
        </Link>

        <Link
          href="/profile"
          className="flex flex-col items-center gap-1 text-gray-400 hover:text-blue-600"
        >
          <User className="w-5 h-5" />

          <span className="text-[11px] font-semibold">
            Profile
          </span>
        </Link>

      </section>

    </main>
  );
}
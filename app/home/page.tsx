"use client";

import { useState, useEffect, useRef } from "react";
import { BleClient } from "@capacitor-community/bluetooth-le";
import {
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
  AndroidBiometryStrength,
} from "@aparajita/capacitor-biometric-auth";
import { createClient } from "@/app/lib/supabase/client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

import {
  Menu,
  Bell,
  Home as HomeIcon,
  Clock,
  User,
  Settings,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  CheckCircle2,
  Fingerprint,
  Loader2,
  Bluetooth,
  BluetoothSearching,
  XCircle,
  GraduationCap,
  ScanFace,
  ShieldCheck,
} from "lucide-react";

// ======================================================
// SUPABASE
// ======================================================

const supabase = createClient();

// ======================================================
// TYPES
// ======================================================

interface StudentProfile {
  student_id: string;
  First_name: string;
  Second_name: string | null;
  email: string | null;
  Program: string | null;
  auth_user_id?: string;
}

interface SessionData {
  isBroadcasting: boolean;
  sessionId: string | null;
  activeToken: string;
  courseName: string;
  teacherName: string;
  room: string;
}

interface BleSessionPayload {
  active: boolean;
  token: string | null;
  sessionId: string | null;
  courseName: string | null;
  teacherName: string | null;
  room: string | null;
}
interface DiscoveredBleDevice {
  deviceId: string;
  deviceName: string;
  rssi: number | null;
  uuids: string[];
}

// ======================================================
// BLE CONFIGURATION
// ======================================================

const TEACHER_SERVICE_UUID =
  "12345678-1234-5678-1234-567812345678";

const TEACHER_CHARACTERISTIC_UUID =
  "12345678-1234-5678-1234-567812345679";

const TEACHER_DEVICE_NAME =
  "UR-Attendance";

const BLE_SESSION_REFRESH_MS = 3000;

// Android BLE connections can occasionally fail with the generic GATT 133
// error. These limits prevent rapid/overlapping connection attempts.
const BLE_CONNECT_MAX_ATTEMPTS = 5;
const BLE_CONNECT_RETRY_DELAY_MS = 2000;
const BLE_CONNECT_SETTLE_DELAY_MS = 700;

// ======================================================
// OPTIONAL HTTP SERVER
// ======================================================

const SERVER_IP = "192.168.1.101";

const API_URL =
  `http://${SERVER_IP}:3000/api/active-session`;

// ======================================================
// UUID NORMALIZATION
// ======================================================

function normalizeUuid(uuid: string): string {
  return uuid
    .toLowerCase()
    .replace(/-/g, "")
    .trim();
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function MobileDashboard() {
  const router = useRouter();
  const pathname = usePathname();

  // ====================================================
  // STUDENT
  // ====================================================

  const [student, setStudent] =
    useState<StudentProfile | null>(null);

  const [studentLoading, setStudentLoading] =
    useState(true);

  const studentRef =
    useRef<StudentProfile | null>(null);

  // ====================================================
  // MENU
  // ====================================================

  const [isMenuOpen, setIsMenuOpen] =
    useState(false);

  // ====================================================
  // SESSION
  // ====================================================

  const [session, setSession] =
    useState<SessionData | null>(null);

  // ====================================================
  // CONNECTION
  // ====================================================

  const [connectionStatus, setConnectionStatus] =
    useState("Waiting for BLE teacher...");

  // ====================================================
  // BLE
  // ====================================================

  const [bleStatus, setBleStatus] =
    useState("Starting Bluetooth...");

  const [teacherDetected, setTeacherDetected] =
    useState(false);

  const [teacherConnected, setTeacherConnected] =
    useState(false);

  const [teacherDeviceId, setTeacherDeviceId] =
    useState<string | null>(null);

  const [teacherRssi, setTeacherRssi] =
    useState<number | null>(null);

  const [bleError, setBleError] =
    useState("");

  // ====================================================
  // BLE DEBUG DEVICES
  // ====================================================

  const [discoveredDevices, setDiscoveredDevices] =
    useState<DiscoveredBleDevice[]>([]);

  // ====================================================
  // ATTENDANCE SESSION MEMORY
  // ====================================================

  const [
    attendanceSessionDetected,
    setAttendanceSessionDetected,
  ] = useState(false);

  const attendanceSessionDetectedRef =
    useRef(false);

  // ====================================================
  // ABSENT STATUS
  // ====================================================

  const [absentRecorded, setAbsentRecorded] =
    useState(false);

  // ====================================================
  // ATTENDANCE FLOW
  // ====================================================

  const [attendanceError, setAttendanceError] =
    useState("");

  const [flowStep, setFlowStep] =
    useState<
      "checking" |
      "auth" |
      "verifying" |
      "success"
    >("checking");

  // ====================================================
  // AUTHENTICATION METHOD
  // ====================================================

  const [
    selectedAuthMethod,
    setSelectedAuthMethod,
  ] = useState<
    "fingerprint" |
    "face" |
    "device" |
    null
  >(null);

  const [
    biometricInfo,
    setBiometricInfo,
  ] = useState<{
    isAvailable: boolean;
    strongBiometryIsAvailable: boolean;
    deviceIsSecure: boolean;
  } | null>(null);

  // ====================================================
  // REFS
  // ====================================================

  const connectedDeviceRef =
    useRef<string | null>(null);

  const connectingRef =
    useRef(false);

  const readingSessionRef =
    useRef(false);

  const refreshIntervalRef =
    useRef<
      ReturnType<typeof setInterval> | null
    >(null);

  const absentProcessingRef =
    useRef(false);

  const lastActiveSessionRef =
    useRef<BleSessionPayload | null>(null);

  const endedSessionHandledRef =
    useRef(false);

  const reconnectingRef =
    useRef(false);

  const bleCleanupRef =
    useRef(false);

  // Forces the BLE scanner to start a fresh cycle after an attendance
  // session ends. The cryptographic device identity is NOT affected.
  const [bleScanRestartKey, setBleScanRestartKey] = useState(0);

  // Prevents an older async scanner cleanup from disconnecting a newer
  // BLE scan/connection.
  const bleScanGenerationRef = useRef(0);

  // ====================================================
  // KEEP STUDENT REF UPDATED
  // ====================================================

  useEffect(() => {
    studentRef.current = student;
  }, [student]);

  // ====================================================
  // LOAD LOGGED-IN STUDENT
  // ====================================================

  useEffect(() => {
    let mounted = true;

    const loadStudent = async () => {
      try {
        setStudentLoading(true);

        console.log(
          "================================="
        );

        console.log(
          "LOADING LOGGED-IN STUDENT"
        );

        console.log(
          "================================="
        );

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          console.error(
            "AUTH USER ERROR:",
            authError
          );

          if (mounted) {
            setStudentLoading(false);
            router.replace("/login");
          }

          return;
        }

        if (!user) {
          console.log(
            "No authenticated user."
          );

          if (mounted) {
            setStudentLoading(false);
            router.replace("/login");
          }

          return;
        }

        console.log(
          "Authenticated user:",
          user.id
        );

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

          if (mounted) {
            setStudentLoading(false);
          }

          return;
        }

        if (!studentData) {
          console.error(
            "No student profile found."
          );

          if (mounted) {
            setStudentLoading(false);
          }

          return;
        }

        if (!mounted) {
          return;
        }

        setStudent(studentData);

        studentRef.current =
          studentData;

        console.log(
          "✅ STUDENT PROFILE LOADED:",
          studentData
        );

      } catch (error) {
        console.error(
          "FAILED TO LOAD STUDENT:",
          error
        );
      } finally {
        if (mounted) {
          setStudentLoading(false);
        }
      }
    };

    loadStudent();

    return () => {
      mounted = false;
    };
  }, [router]);

  // ====================================================
  // CHECK BIOMETRIC CAPABILITY
  // ====================================================

  useEffect(() => {
    let mounted = true;

    const loadBiometricInfo = async () => {
      try {
        const info =
          await BiometricAuth.checkBiometry();

        if (!mounted) {
          return;
        }

        console.log(
          "================================="
        );

        console.log(
          "DEVICE BIOMETRY INFORMATION"
        );

        console.log(
          "================================="
        );

        console.log(
          "Biometry:",
          info
        );

        setBiometricInfo({
          isAvailable:
            info.isAvailable,

          strongBiometryIsAvailable:
            info.strongBiometryIsAvailable,

          deviceIsSecure:
            info.deviceIsSecure,
        });

      } catch (error) {
        console.error(
          "FAILED TO CHECK BIOMETRIC CAPABILITY:",
          error
        );
      }
    };

    loadBiometricInfo();

    return () => {
      mounted = false;
    };
  }, []);

  // ====================================================
  // STUDENT DISPLAY HELPERS
  // ====================================================

  const studentFullName = student
    ? `${student.First_name} ${
        student.Second_name ?? ""
      }`.trim()
    : "";

  const studentInitials = student
    ? `${student.First_name?.charAt(0) ?? ""}${
        student.Second_name?.charAt(0) ?? ""
      }`.toUpperCase()
    : "";

  // ====================================================
  // DATAVIEW → TEXT
  // ====================================================

  const dataViewToText = (
    value: DataView
  ): string => {
    const bytes =
      new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength
      );

    return new TextDecoder().decode(bytes);
  };

  // ====================================================
  // MARK STUDENT ABSENT
  // ====================================================

  const markStudentAbsentIfNeeded =
    async (
      endedSession: BleSessionPayload
    ): Promise<boolean> => {

      if (absentProcessingRef.current) {
        console.log(
          "ABSENT processing already running."
        );
        return false;
      }

      const currentStudent = studentRef.current;

      if (!currentStudent) {
        console.error(
          "Cannot mark ABSENT because student profile is unavailable."
        );
        return false;
      }

      absentProcessingRef.current = true;

      try {
        if (
          !endedSession.courseName ||
          !endedSession.teacherName ||
          !endedSession.room
        ) {
          console.log(
            "Cannot create ABSENT record because ended BLE session information is incomplete."
          );
          return false;
        }

        console.log("\n=================================");
        console.log("CHECKING ABSENT STATUS");
        console.log("=================================");
        console.log("Student:", currentStudent.student_id);
        console.log(
          "Student Name:",
          `${currentStudent.First_name} ${currentStudent.Second_name ?? ""}`.trim()
        );
        console.log("Course:", endedSession.courseName);
        console.log("Teacher:", endedSession.teacherName);
        console.log("Room:", endedSession.room);

        const now = new Date();
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        ).toISOString();
        const endOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1
        ).toISOString();

        const {
          data: existingRecords,
          error: existingError,
        } = await supabase
          .from("attendance")
          .select("id,status,course_name,created_at")
          .eq("student_id", currentStudent.student_id)
          .eq("course_name", endedSession.courseName)
          .gte("created_at", startOfDay)
          .lt("created_at", endOfDay);

        if (existingError) {
          console.error(
            "ERROR CHECKING EXISTING ATTENDANCE:",
            existingError
          );
          return false;
        }

        console.log("Existing attendance records:", existingRecords);

        const alreadyPresent = existingRecords?.some(
          (record) =>
            (record.status || "").toUpperCase() === "PRESENT"
        );

        if (alreadyPresent) {
          console.log("✅ STUDENT ALREADY MARKED PRESENT");
          setAbsentRecorded(false);
          return true;
        }

        const alreadyAbsent = existingRecords?.some(
          (record) =>
            (record.status || "").toUpperCase() === "ABSENT"
        );

        if (alreadyAbsent) {
          console.log("Student already has an ABSENT record.");
          setAbsentRecorded(true);
          return true;
        }

        console.log("No PRESENT record found.");
        console.log("Creating ABSENT record...");

        const {
          data: absentRecord,
          error: absentError,
        } = await supabase
          .from("attendance")
         .insert({
  student_id: currentStudent.student_id,
  student_name: `${currentStudent.First_name} ${currentStudent.Second_name ?? ""}`.trim(),
  course_name: endedSession.courseName,
  teacher_name: endedSession.teacherName,
  room: endedSession.room,
  status: "ABSENT",
  token: endedSession.token,
})
          .select()
          .single();

        if (absentError) {
          console.error(
            "❌ FAILED TO CREATE ABSENT RECORD:",
            absentError
          );
          return false;
        }

        console.log("=================================");
        console.log("❌ STUDENT MARKED ABSENT");
        console.log(absentRecord);
        console.log("=================================");
        setAbsentRecorded(true);
        return true;

      } catch (error) {
        console.error("ABSENT PROCESS ERROR:", error);
        return false;
      } finally {
        absentProcessingRef.current = false;
      }
    };

  // ====================================================
  // HANDLE ENDED ATTENDANCE SESSION
  // ====================================================

  const handleEndedAttendanceSession =
    async (payload: BleSessionPayload) => {

      if (endedSessionHandledRef.current) {
        console.log("Ended attendance session was already handled.");
        return;
      }

      endedSessionHandledRef.current = true;

      console.log("=================================");
      console.log("🛑 TEACHER ATTENDANCE SESSION ENDED");
      console.log("=================================");

      if (attendanceSessionDetectedRef.current) {
        console.log(
          "✅ This phone previously detected the active session."
        );
        console.log("Checking attendance status...");

        const processed = await markStudentAbsentIfNeeded(payload);

        if (!processed) {
          console.log(
            "⚠️ Attendance end processing did not complete. Keeping the detection flag for another attempt."
          );
          endedSessionHandledRef.current = false;
          return;
        }
      } else {
        console.log("This phone never detected the active session.");
        console.log("No ABSENT record will be created.");
      }

      // Release the old GATT connection before starting the next BLE cycle.
      const endedDeviceId =
        connectedDeviceRef.current || teacherDeviceId;

      if (endedDeviceId) {
        await disconnectTeacherQuietly(endedDeviceId);
      }

      setSession(null);
      setTeacherConnected(false);
      setTeacherDetected(false);
      setBleStatus(
        "Attendance session ended — scanning for next session..."
      );
      setConnectionStatus(
        "Waiting for next BLE teacher session..."
      );

      attendanceSessionDetectedRef.current = false;
      setAttendanceSessionDetected(false);
      lastActiveSessionRef.current = null;
      connectedDeviceRef.current = null;
      setTeacherDeviceId(null);
      setAbsentRecorded(false);
      endedSessionHandledRef.current = false;

      // Restart the scanner without requiring logout/login or Bluetooth restart.
      setBleScanRestartKey((value) => value + 1);
    };

  // ====================================================
  // BLE CONNECTION HELPERS
  // ====================================================

  async function disconnectTeacherQuietly(deviceId: string) {
    try {
      await BleClient.disconnect(deviceId);
      console.log("🧹 BLE OLD CONNECTION CLEANED:", deviceId);
    } catch (error) {
      // Android can report an error when the device is already disconnected.
      // That is safe here because this helper is only cleanup before retrying.
      console.log("ℹ️ BLE cleanup: device was already disconnected or unavailable.", error);
    }

    if (connectedDeviceRef.current === deviceId) {
      connectedDeviceRef.current = null;
    }
  }

  async function stopBleScanQuietly() {
    try {
      await BleClient.stopLEScan();
      console.log("🛑 BLE scan stopped before GATT connection");
    } catch (error) {
      console.log("ℹ️ BLE scan was already stopped or could not be stopped:", error);
    }
  }

  // ====================================================
  // READ TEACHER BLE SESSION
  // ====================================================

  async function readTeacherSession(deviceId: string) {

    if (readingSessionRef.current) {
      console.log(
        "BLE session read already running; skipping overlapping read."
      );
      return;
    }

    readingSessionRef.current = true;

    try {
      console.log("=================================");
      console.log("READING TEACHER BLE SESSION");
      console.log("Device:", deviceId);
      console.log("Service UUID:", TEACHER_SERVICE_UUID);
      console.log("Characteristic UUID:", TEACHER_CHARACTERISTIC_UUID);
      console.log("=================================");

      let value: DataView | null = null;
      let lastReadError: unknown = null;

      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          value = await BleClient.read(
            deviceId,
            TEACHER_SERVICE_UUID,
            TEACHER_CHARACTERISTIC_UUID
          );
          console.log(
            `✅ BLE SESSION READ SUCCEEDED ON ATTEMPT ${attempt}`
          );
          break;
        } catch (error) {
          lastReadError = error;
          console.error(
            `❌ BLE SESSION READ FAILED (attempt ${attempt}/5):`,
            error
          );
          if (attempt < 5) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }
      }

      if (!value) {
        throw (
          lastReadError instanceof Error
            ? lastReadError
            : new Error(
                "Unable to read teacher BLE session after multiple attempts."
              )
        );
      }

      const text = dataViewToText(value).trim();
      console.log("RAW BLE DATA:", text);

      if (!text) {
        throw new Error(
          "Teacher BLE characteristic returned empty data."
        );
      }

      const payload = JSON.parse(text) as BleSessionPayload;
      console.log("DECODED BLE SESSION:", payload);

      // ==================================================
      // SESSION ENDED
      // ==================================================

      if (payload.active === false) {
        await handleEndedAttendanceSession(payload);
        return;
      }

      // ==================================================
      // ACTIVE SESSION VALIDATION
      // ==================================================

      if (
        !payload.token ||
        !payload.courseName ||
        !payload.teacherName ||
        !payload.room
      ) {
        throw new Error("Teacher BLE session is incomplete.");
      }

      const newSession: SessionData = {
        isBroadcasting: true,
        sessionId: payload.sessionId,
        activeToken: payload.token,
        courseName: payload.courseName,
        teacherName: payload.teacherName,
        room: payload.room,
      };

      setSession(newSession);

      // IMPORTANT: keep this protection. Only a phone that actually
      // detected the ACTIVE session may later be marked ABSENT.
      attendanceSessionDetectedRef.current = true;
      setAttendanceSessionDetected(true);

      // Keep the newest active payload in memory.
      lastActiveSessionRef.current = payload;

      // A new active session can be handled when it ends.
      endedSessionHandledRef.current = false;

      setTeacherDetected(true);
      setTeacherConnected(true);
      setTeacherDeviceId(deviceId);
      setBleStatus("Teacher connected ✓");
      setConnectionStatus("Full session received via BLE ✓");
      setBleError("");

      console.log("✅ FULL TEACHER SESSION RECEIVED");

    } catch (error) {
      console.error("❌ BLE SESSION READ ERROR:", error);

      if (error instanceof Error) {
        setBleError(error.message);
      } else {
        setBleError("Unable to read teacher BLE session.");
      }

      // Never mark ABSENT because of a read error. We require a real
      // active:false payload from the teacher.
      if (attendanceSessionDetectedRef.current) {
        setBleStatus(
          "BLE read failed; waiting for session-end signal..."
        );
      }

    } finally {
      readingSessionRef.current = false;
    }
  }

  // ====================================================
  // RECONNECT TO TEACHER AFTER BLE DISCONNECT
  // ====================================================

  async function recoverTeacherConnection(deviceId: string) {

    if (bleCleanupRef.current || reconnectingRef.current) {
      return;
    }

    reconnectingRef.current = true;

    try {
      setBleStatus(
        "Teacher connection lost; reconnecting..."
      );
      setConnectionStatus("Reconnecting to teacher via BLE...");

      // Make sure no scan remains active while Android is negotiating GATT.
      await stopBleScanQuietly();

      for (let attempt = 1; attempt <= BLE_CONNECT_MAX_ATTEMPTS; attempt++) {
        if (bleCleanupRef.current) {
          return;
        }

        await disconnectTeacherQuietly(deviceId);

        if (attempt > 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, BLE_CONNECT_RETRY_DELAY_MS)
          );
        }

        try {
          console.log(
            `🔄 BLE RECONNECT ATTEMPT ${attempt}/${BLE_CONNECT_MAX_ATTEMPTS}:`,
            deviceId
          );

          await BleClient.connect(deviceId, () => {
            console.log(
              "BLE DISCONNECTED DURING RECOVERY:",
              deviceId
            );

            if (connectedDeviceRef.current === deviceId) {
              connectedDeviceRef.current = null;
            }

            setTeacherConnected(false);

            // Do not start a second recovery while this recovery is already
            // running. The recovery loop itself will handle another attempt.
          });

          connectedDeviceRef.current = deviceId;
          setTeacherDeviceId(deviceId);
          setTeacherDetected(true);
          setTeacherConnected(true);

          console.log(
            `✅ BLE RECONNECTED ON ATTEMPT ${attempt}`
          );

          await new Promise((resolve) =>
            setTimeout(resolve, BLE_CONNECT_SETTLE_DELAY_MS)
          );

          await readTeacherSession(deviceId);
          return;

        } catch (error) {
          console.error(
            `❌ BLE RECONNECT FAILED (attempt ${attempt}/${BLE_CONNECT_MAX_ATTEMPTS}):`,
            error
          );

          await disconnectTeacherQuietly(deviceId);

          if (attempt === BLE_CONNECT_MAX_ATTEMPTS) {
            break;
          }
        }
      }

      console.log(
        "⚠️ Could not reconnect to teacher. No ABSENT record was created because no active:false BLE end signal was received."
      );

      setTeacherConnected(false);
      setBleStatus(
        "Teacher disconnected; no session-end signal received"
      );
      setConnectionStatus("Waiting for BLE teacher...");

    } finally {
      reconnectingRef.current = false;
    }
  }

  // ====================================================
  // CONNECT TO TEACHER
  // ====================================================

  async function connectToTeacher(deviceId: string) {

    if (bleCleanupRef.current) {
      return;
    }

    if (connectedDeviceRef.current === deviceId) {
      console.log("Already connected to teacher.");
      setTeacherConnected(true);
      await readTeacherSession(deviceId);
      return;
    }

    // This lock is acquired BEFORE the first await so duplicate scan
    // callbacks cannot start multiple GATT connections at once.
    if (connectingRef.current || reconnectingRef.current) {
      console.log("Connection already in progress.");
      return;
    }

    connectingRef.current = true;

    try {
      setBleStatus("Preparing BLE connection...");
      setConnectionStatus("Preparing connection to teacher...");
      setBleError("");

      console.log("=================================");
      console.log("CONNECTING TO TEACHER WITH RETRIES");
      console.log("Device ID:", deviceId);
      console.log("=================================");

      // A scan and a GATT connection should not compete for the same
      // Android Bluetooth stack at the same time.
      await stopBleScanQuietly();

      // Clean up a stale GATT state before the first connection attempt.
      await disconnectTeacherQuietly(deviceId);

      let connected = false;
      let lastConnectionError: unknown = null;

      for (let attempt = 1; attempt <= BLE_CONNECT_MAX_ATTEMPTS; attempt++) {
        if (bleCleanupRef.current) {
          return;
        }

        if (attempt > 1) {
          setBleStatus(
            `Retrying teacher connection (${attempt}/${BLE_CONNECT_MAX_ATTEMPTS})...`
          );
          setConnectionStatus(
            `BLE connection retry ${attempt}/${BLE_CONNECT_MAX_ATTEMPTS}...`
          );

          await disconnectTeacherQuietly(deviceId);
          await new Promise((resolve) =>
            setTimeout(resolve, BLE_CONNECT_RETRY_DELAY_MS)
          );
        } else {
          setBleStatus(
            `Connecting to teacher (1/${BLE_CONNECT_MAX_ATTEMPTS})...`
          );
        }

        try {
          console.log(
            `🔵 BLE GATT CONNECT ATTEMPT ${attempt}/${BLE_CONNECT_MAX_ATTEMPTS}`
          );

          await BleClient.connect(deviceId, () => {
            console.log("BLE DISCONNECTED:", deviceId);

            if (connectedDeviceRef.current === deviceId) {
              connectedDeviceRef.current = null;
            }

            setTeacherConnected(false);

            // During the initial connection loop, the loop itself handles
            // the failure. Do not launch a competing recovery here.
            if (connectingRef.current || reconnectingRef.current) {
              return;
            }

            // A disconnect is NOT an attendance-session end. If this phone
            // previously detected the active session, recover and look for
            // the real active:false end signal.
            if (!bleCleanupRef.current && attendanceSessionDetectedRef.current) {
              setTeacherDetected(true);
              setTeacherDeviceId(deviceId);
              void recoverTeacherConnection(deviceId);
            } else if (!bleCleanupRef.current) {
              setTeacherDetected(false);
              setTeacherDeviceId(null);
              setSession(null);
              setBleStatus("Teacher disconnected.");
              setConnectionStatus("Waiting for BLE teacher...");
            }
          });

          connectedDeviceRef.current = deviceId;
          connected = true;

          console.log(
            `✅ GATT CONNECTION SUCCEEDED ON ATTEMPT ${attempt}`
          );
          break;

        } catch (error) {
          lastConnectionError = error;

          const errorText =
            error instanceof Error
              ? error.message
              : String(error);

          console.error(
            `❌ GATT CONNECTION FAILED (attempt ${attempt}/${BLE_CONNECT_MAX_ATTEMPTS})`,
            error
          );

          if (errorText.toLowerCase().includes("133")) {
            console.warn(
              "⚠️ Android GATT 133 detected. Cleaning stale GATT state and retrying..."
            );
          }

          await disconnectTeacherQuietly(deviceId);
        }
      }

      if (!connected) {
        throw (
          lastConnectionError instanceof Error
            ? lastConnectionError
            : new Error(
                "Unable to establish a BLE GATT connection after multiple attempts."
              )
        );
      }

      // Give Android a short moment to finish service discovery before the
      // first characteristic read.
      await new Promise((resolve) =>
        setTimeout(resolve, BLE_CONNECT_SETTLE_DELAY_MS)
      );

      if (bleCleanupRef.current) {
        return;
      }

      connectingRef.current = false;

      setTeacherDeviceId(deviceId);
      setTeacherDetected(true);
      setTeacherConnected(true);
      setBleStatus("Teacher connected ✓");
      setConnectionStatus("Connected to teacher via BLE ✓");

      console.log("✅ TEACHER BLE CONNECTION SUCCESSFUL");

      await readTeacherSession(deviceId);

    } catch (error) {
      console.error("=================================");
      console.error("❌ BLE CONNECTION FAILED AFTER ALL RETRIES");
      console.error(error);
      console.error("=================================");

      await disconnectTeacherQuietly(deviceId);

      setTeacherConnected(false);

      if (error instanceof Error) {
        setBleError(error.message);
      } else {
        setBleError("Unable to connect to teacher.");
      }

      setBleStatus("Teacher found, connection failed after retries");
      setConnectionStatus("BLE connection failed");

    } finally {
      connectingRef.current = false;
    }
  }

  // ====================================================
  // AUTOMATIC BLE SCANNER
  // ====================================================

  useEffect(() => {

    if (
      studentLoading ||
      !student
    ) {
      return;
    }

    let mounted = true;

    const scanGeneration =
      bleScanGenerationRef.current + 1;

    bleScanGenerationRef.current =
      scanGeneration;

    bleCleanupRef.current = false;

    const startBleScan =
      async () => {

        try {

          console.log(
            "================================="
          );

          console.log(
            "STARTING AUTOMATIC BLE SCAN"
          );

          console.log(
            "Student:",
            student.student_id
          );

          console.log(
            "================================="
          );

          setBleStatus(
            "Initializing Bluetooth..."
          );

          setBleError("");

          await BleClient.initialize();

          if (!mounted) {
            return;
          }

          console.log(
            "✅ BLUETOOTH INITIALIZED"
          );

          setBleStatus(
            "Scanning for teacher..."
          );

          setConnectionStatus(
            "Waiting for BLE teacher..."
          );

          await BleClient.requestLEScan(
            {
              allowDuplicates: true,
            },
            async (result) => {

              if (!mounted) {
                return;
              }

              const deviceId =
                result.device.deviceId;

              const deviceName =
                result.localName ||
                result.device.name ||
                "";

              const advertisedUuids =
                result.uuids || [];

              console.log(
                "BLE DEVICE FOUND:",
                {
                  deviceId,
                  deviceName,
                  rssi: result.rssi,
                  uuids:
                    advertisedUuids,
                }
              );

              setDiscoveredDevices(
                (previous) => {

                  const newDevice:
                    DiscoveredBleDevice = {
                      deviceId,

                      deviceName:
                        deviceName ||
                        "(no name)",

                      rssi:
                        typeof result.rssi ===
                        "number"
                          ? result.rssi
                          : null,

                      uuids:
                        advertisedUuids,
                    };

                  const existingIndex =
                    previous.findIndex(
                      (device) =>
                        device.deviceId ===
                        deviceId
                    );

                  if (
                    existingIndex >= 0
                  ) {

                    const updated =
                      [...previous];

                    updated[
                      existingIndex
                    ] =
                      newDevice;

                    return updated;
                  }

                  return [
                    ...previous,
                    newDevice,
                  ].slice(
                    0,
                    10
                  );
                }
              );

              if (
                typeof result.rssi ===
                "number"
              ) {

                setTeacherRssi(
                  result.rssi
                );
              }

              const matchingName =
                deviceName
                  .trim()
                  .toLowerCase() ===
                TEACHER_DEVICE_NAME.toLowerCase();

              const matchingService =
                advertisedUuids.some(
                  (uuid) =>
                    normalizeUuid(uuid) ===
                    normalizeUuid(
                      TEACHER_SERVICE_UUID
                    )
                );

              console.log(
                "BLE MATCH CHECK:",
                {
                  deviceName,
                  matchingName,
                  matchingService,
                  advertisedUuids,
                  expectedService:
                    TEACHER_SERVICE_UUID,
                }
              );

              if (
                (
                  matchingName ||
                  matchingService
                ) &&
                !connectingRef.current &&
                connectedDeviceRef.current !==
                  deviceId
              ) {

                console.log(
                  "================================="
                );

                console.log(
                  "✅ TEACHER BLE DETECTED"
                );

                console.log(
                  "Device:",
                  deviceName
                );

                console.log(
                  "Device ID:",
                  deviceId
                );

                console.log(
                  "RSSI:",
                  result.rssi
                );

                console.log(
                  "Stopping scan..."
                );

                console.log(
                  "================================="
                );

                setTeacherDetected(
                  true
                );

                setTeacherDeviceId(
                  deviceId
                );

                setBleStatus(
                  "Teacher detected ✓"
                );

                setBleError("");

                try {

                  await BleClient.stopLEScan();

                  console.log(
                    "🛑 BLE SCAN STOPPED"
                  );

                } catch (error) {

                  console.error(
                    "Failed to stop BLE scan:",
                    error
                  );
                }

                await connectToTeacher(
                  deviceId
                );
              }
            }
          );

          if (!mounted) {
            return;
          }

          console.log(
            "✅ BLE SCAN STARTED"
          );

        } catch (error) {

          console.error(
            "================================="
          );

          console.error(
            "❌ BLE SCAN ERROR"
          );

          console.error(
            error
          );

          console.error(
            "================================="
          );

          if (!mounted) {
            return;
          }

          setBleStatus(
            "Bluetooth scan failed"
          );

          if (
            error instanceof Error
          ) {

            setBleError(
              error.message
            );

          } else {

            setBleError(
              "Unknown Bluetooth error"
            );
          }
        }
      };

    startBleScan();

    return () => {

      mounted = false;
      bleCleanupRef.current = true;

      console.log(
        "Cleaning up BLE..."
      );

      if (
        refreshIntervalRef.current
      ) {

        clearInterval(
          refreshIntervalRef.current
        );

        refreshIntervalRef.current =
          null;
      }

      const cleanup =
        async () => {

          try {

            await BleClient.stopLEScan();

          } catch (error) {

            console.error(
              "Failed to stop BLE scan:",
              error
            );
          }

          // Never let an older cleanup disconnect a newer BLE connection.
          if (
            bleScanGenerationRef.current !==
            scanGeneration
          ) {
            return;
          }

          const cleanupDeviceId =
            connectedDeviceRef.current;

          if (cleanupDeviceId) {

            try {

              await BleClient.disconnect(
                cleanupDeviceId
              );

            } catch (error) {

              console.error(
                "Failed to disconnect teacher:",
                error
              );
            }

            if (
              bleScanGenerationRef.current ===
                scanGeneration &&
              connectedDeviceRef.current ===
                cleanupDeviceId
            ) {
              connectedDeviceRef.current =
                null;
            }
          }

          if (
            bleScanGenerationRef.current ===
            scanGeneration
          ) {
            connectingRef.current =
              false;
            reconnectingRef.current =
              false;
            readingSessionRef.current =
              false;
          }
        };

      cleanup();
    };

  }, [
    student,
    studentLoading,
    bleScanRestartKey,
  ]);

  // ====================================================
  // REFRESH BLE SESSION
  // ====================================================

  useEffect(() => {

    if (!teacherDeviceId) {
      return;
    }

    if (
      refreshIntervalRef.current
    ) {

      clearInterval(
        refreshIntervalRef.current
      );
    }

    readTeacherSession(
      teacherDeviceId
    );

    refreshIntervalRef.current =
      setInterval(
        () => {

          readTeacherSession(
            teacherDeviceId
          );

        },
        BLE_SESSION_REFRESH_MS
      );

    return () => {

      if (
        refreshIntervalRef.current
      ) {

        clearInterval(
          refreshIntervalRef.current
        );

        refreshIntervalRef.current =
          null;
      }
    };

  }, [teacherDeviceId]);

  // ====================================================
  // OPTIONAL HTTP CHECK
  // ====================================================

  useEffect(() => {

    if (
      studentLoading
    ) {
      return;
    }

    const checkBroadcast =
      async () => {

        if (teacherDetected) {
          return;
        }

        try {

          setConnectionStatus(
            "Waiting for BLE teacher..."
          );

          console.log(
            "Optional HTTP check:",
            API_URL
          );

          const response =
            await fetch(
              API_URL,
              {
                method: "GET",
                cache: "no-store",
              }
            );

          if (!response.ok) {
            throw new Error(
              `Teacher server returned HTTP ${response.status}`
            );
          }

          console.log(
            "HTTP server is reachable."
          );

        } catch {

          console.log(
            "HTTP unavailable; BLE remains primary."
          );
        }
      };

    checkBroadcast();

  }, [
    teacherDetected,
    studentLoading,
  ]);

  // ====================================================
  // MARK ATTENDANCE
  // ====================================================

  const handleMarkAttendance =
    () => {

      if (!student) {

        setAttendanceError(
          "Student profile has not loaded yet."
        );

        return;
      }

      if (!session) {

        setAttendanceError(
          "Teacher attendance session has not been detected yet."
        );

        return;
      }

      setAttendanceError("");

      setSelectedAuthMethod(
        null
      );

      setFlowStep(
        "auth"
      );
    };

  // ====================================================
  // REAL BIOMETRIC AUTHENTICATION
  // ====================================================

  const authenticateStudent =
    async (
      method:
        "fingerprint" |
        "face" |
        "device"
    ): Promise<boolean> => {

      try {

        setAttendanceError("");

        console.log(
          "================================="
        );

        console.log(
          "STARTING REAL BIOMETRIC AUTHENTICATION"
        );

        console.log(
          "SELECTED METHOD:",
          method
        );

        console.log(
          "================================="
        );

        const info =
          await BiometricAuth.checkBiometry();

        console.log(
          "CURRENT BIOMETRY STATUS:",
          info
        );

        setBiometricInfo({
          isAvailable:
            info.isAvailable,

          strongBiometryIsAvailable:
            info.strongBiometryIsAvailable,

          deviceIsSecure:
            info.deviceIsSecure,
        });

        // ------------------------------------------------
        // BIOMETRIC NOT AVAILABLE
        // ------------------------------------------------

        if (!info.isAvailable && !info.deviceIsSecure) {

          setAttendanceError(
            "This phone does not have a usable biometric method or a secure device screen lock."
          );

          return false;
        }

        if (method === "device" && !info.deviceIsSecure) {
          setAttendanceError(
            "This phone does not have a secure PIN, pattern, or password."
          );

          return false;
        }

        // ------------------------------------------------
        // SELECTED METHOD
        // ------------------------------------------------

        if (method === "device") {

          console.log(
            "Student selected device PIN / screen lock."
          );

        } else if (method === "fingerprint") {

          console.log(
            "Student selected fingerprint / biometric."
          );

        } else {

          console.log(
            "Student selected face / biometric."
          );

        }

        // ------------------------------------------------
        // OPEN NATIVE ANDROID PROMPT
        // ------------------------------------------------

        const authenticateOptions =
          method === "device"
            ? {
                reason:
                  "Use your device PIN, pattern, or password to mark attendance",
                cancelTitle:
                  "Cancel",
                allowDeviceCredential:
                  true,
                androidTitle:
                  "Confirm Attendance",
                androidSubtitle:
                  "Verify with your device screen lock",
                androidConfirmationRequired:
                  false,
              }
            : {
                reason:
                  method === "fingerprint"
                    ? "Use fingerprint to mark attendance"
                    : "Use face verification to mark attendance",
                cancelTitle:
                  "Cancel",
                allowDeviceCredential:
                  false,
                androidTitle:
                  "Confirm Attendance",
                androidSubtitle:
                  method === "fingerprint"
                    ? "Verify with your fingerprint"
                    : "Verify with face verification",
                androidConfirmationRequired:
                  false,
                androidBiometryStrength:
                  AndroidBiometryStrength.weak,
              };

        await BiometricAuth.authenticate(
          authenticateOptions
        );

        console.log(
          "✅ REAL BIOMETRIC AUTHENTICATION SUCCESSFUL"
        );

        return true;

      } catch (error) {

        console.error(
          "❌ BIOMETRIC AUTHENTICATION FAILED:",
          error
        );

        // ------------------------------------------------
        // PLUGIN BIOMETRY ERROR
        // ------------------------------------------------

        if (
          error instanceof BiometryError
        ) {

          console.error(
            "Biometry error code:",
            error.code
          );

          console.error(
            "Biometry error message:",
            error.message
          );

          // ----------------------------------------------
          // USER CANCEL
          // ----------------------------------------------

          if (
            error.code ===
            BiometryErrorType.userCancel
          ) {

            setAttendanceError(
              "Authentication was cancelled."
            );

            return false;
          }

          // ----------------------------------------------
          // SYSTEM CANCEL
          // ----------------------------------------------

          if (
            error.code ===
            BiometryErrorType.systemCancel
          ) {

            setAttendanceError(
              "Authentication was cancelled by the system."
            );

            return false;
          }

          // ----------------------------------------------
          // APP CANCEL
          // ----------------------------------------------

          if (
            error.code ===
            BiometryErrorType.appCancel
          ) {

            setAttendanceError(
              "Authentication was cancelled."
            );

            return false;
          }

          // ----------------------------------------------
          // AUTHENTICATION FAILED
          // ----------------------------------------------

          if (
            error.code ===
            BiometryErrorType.authenticationFailed
          ) {

            setAttendanceError(
              "Authentication failed. Please try again."
            );

            return false;
          }

          // ----------------------------------------------
          // BIOMETRIC LOCKOUT
          // ----------------------------------------------

          if (
            error.code ===
            BiometryErrorType.biometryLockout
          ) {

            setAttendanceError(
              "Biometric authentication is temporarily locked."
            );

            return false;
          }

          // ----------------------------------------------
          // NOT ENROLLED
          // ----------------------------------------------

          if (
            error.code ===
            BiometryErrorType.biometryNotEnrolled
          ) {

            setAttendanceError(
              "No biometric is enrolled for app authentication on this device."
            );

            return false;
          }

          // ----------------------------------------------
          // NOT AVAILABLE
          // ----------------------------------------------

          if (
            error.code ===
            BiometryErrorType.biometryNotAvailable
          ) {

            setAttendanceError(
              "Biometric authentication is not available to this app on this device."
            );

            return false;
          }

          // ----------------------------------------------
          // OTHER PLUGIN ERROR
          // ----------------------------------------------

          setAttendanceError(
            error.message ||
              "Biometric authentication failed."
          );

          return false;
        }

        // ------------------------------------------------
        // GENERIC ERROR
        // ------------------------------------------------

        if (
          error instanceof Error
        ) {

          setAttendanceError(
            error.message
          );

        } else {

          setAttendanceError(
            "Unable to authenticate the student."
          );
        }

        return false;
      }
    };

  // ====================================================
  // RECORD PRESENT AFTER AUTHENTICATION
  // ====================================================

  const handleConfirmBiometrics =
    async () => {

      const currentStudent =
        studentRef.current;

      if (!currentStudent) {

        setAttendanceError(
          "Student profile could not be loaded."
        );

        return;
      }

      if (!session) {

        setAttendanceError(
          "There is no active attendance session."
        );

        return;
      }

      if (!selectedAuthMethod) {

        setAttendanceError(
          "Please choose an authentication method."
        );

        return;
      }

      setAttendanceError("");

      // ==================================================
      // STEP 1: AUTHENTICATE
      // ==================================================

      const authenticated =
        await authenticateStudent(
          selectedAuthMethod
        );

      if (!authenticated) {

        setFlowStep(
          "auth"
        );

        return;
      }

      // ==================================================
      // STEP 2: VERIFYING
      // ==================================================

      setFlowStep(
        "verifying"
      );

      try {

        console.log(
          "================================="
        );

        console.log(
          "RECORDING ATTENDANCE"
        );

        console.log(
          "================================="
        );

        console.log(
          "Authentication method:",
          selectedAuthMethod
        );

        console.log(
          "Student ID:",
          currentStudent.student_id
        );

        console.log(
          "Student Name:",
          `${currentStudent.First_name} ${
            currentStudent.Second_name ?? ""
          }`.trim()
        );

        console.log(
          "Program:",
          currentStudent.Program
        );

        console.log(
          "Course:",
          session.courseName
        );

        console.log(
          "Teacher:",
          session.teacherName
        );

        console.log(
          "Room:",
          session.room
        );

        console.log(
          "BLE Token:",
          session.activeToken
        );

        console.log(
          "✅ IDENTITY VERIFIED BY NATIVE BIOMETRIC AUTHENTICATION"
        );

        // ==================================================
        // TODAY
        // ==================================================

        const now =
          new Date();

        const startOfDay =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          ).toISOString();

        const endOfDay =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1
          ).toISOString();

        // ==================================================
        // CHECK EXISTING PRESENT
        // ==================================================

        const {
          data: existingPresentRows,
          error: existingPresentError,
        } = await supabase
          .from("attendance")
          .select(
            "id,status,created_at"
          )
          .eq(
            "student_id",
            currentStudent.student_id
          )
          .eq(
            "course_name",
            session.courseName
          )
          .eq(
            "status",
            "PRESENT"
          )
          .gte(
            "created_at",
            startOfDay
          )
          .lt(
            "created_at",
            endOfDay
          )
          .limit(1);

        if (
          existingPresentError
        ) {

          console.error(
            "EXISTING ATTENDANCE CHECK ERROR:",
            existingPresentError
          );
        }

        if (
          existingPresentRows &&
          existingPresentRows.length > 0
        ) {

          console.log(
            "Student already has PRESENT attendance."
          );

          setFlowStep(
            "success"
          );

          return;
        }

        // ==================================================
        // INSERT PRESENT
        // ==================================================

        const {
          data,
          error,
        } = await supabase
          .from("attendance")
          .insert({
  student_id: currentStudent.student_id,

  student_name: `${currentStudent.First_name} ${
    currentStudent.Second_name ?? ""
  }`.trim(),

  attendance_session_id: session.sessionId,

  course_name: session.courseName,

            teacher_name:
              session.teacherName,

            room:
              session.room,

            status:
              "PRESENT",

            token:
              session.activeToken,

          })
          .select()
          .single();

        if (error) {

          console.error(
            "SUPABASE ATTENDANCE ERROR:",
            error
          );

          throw new Error(
            error.message ||
              "Failed to record attendance."
          );
        }

        console.log(
          "✅ ATTENDANCE SUCCESSFULLY RECORDED:",
          data
        );

        setAbsentRecorded(
          false
        );

        setFlowStep(
          "success"
        );

      } catch (error) {

        console.error(
          "❌ ATTENDANCE RECORDING FAILED:",
          error
        );

        if (
          error instanceof Error
        ) {

          setAttendanceError(
            error.message
          );

        } else {

          setAttendanceError(
            "Unable to record attendance."
          );
        }

        setFlowStep(
          "auth"
        );
      }
    };

  // ====================================================
  // LOGOUT
  // ====================================================

  const handleLogout =
    async () => {

      try {

        await supabase.auth.signOut();

        router.replace(
          "/login"
        );

      } catch (error) {

        console.error(
          "Logout failed:",
          error
        );

        setAttendanceError(
          "Unable to log out. Please try again."
        );
      }
    };

  // ====================================================
  // RESET FLOW
  // ====================================================

  const resetFlow = () => {

    setAttendanceError("");

    setAbsentRecorded(
      false
    );

    setSelectedAuthMethod(
      null
    );

    setFlowStep(
      "checking"
    );
  };

  // ====================================================
  // LOADING SCREEN
  // ====================================================

  if (
    studentLoading
  ) {

    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">

        <div className="text-center">

          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">

            <GraduationCap className="w-8 h-8 text-blue-600 animate-pulse" />

          </div>

          <h1 className="text-lg font-bold text-gray-900">
            Loading Student Account
          </h1>

          <p className="text-xs text-gray-500 mt-2">
            Please wait while we load your profile...
          </p>

        </div>

      </main>
    );
  }

  // ====================================================
  // NO STUDENT PROFILE
  // ====================================================

  if (!student) {

    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-7 max-w-md w-full text-center">

          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">

            <XCircle className="w-9 h-9 text-red-500" />

          </div>

          <h1 className="text-lg font-bold text-gray-900">
            Student Profile Not Found
          </h1>

          <p className="text-xs text-gray-500 mt-2 leading-5">
            We could not find a student profile
            connected to your account.
          </p>

          <button
            onClick={
              handleLogout
            }
            className="mt-6 w-full py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold"
          >
            Return to Login
          </button>

        </div>

      </main>
    );
  }

  // ====================================================
  // UI
  // ====================================================

  return (
    <main className="bg-gray-50 min-h-screen w-full relative pb-24">

      {/* ==================================================
          TOP HEADER
      ================================================== */}

      <header className="flex justify-between items-center px-4 py-6 bg-white border-b border-gray-100 sticky top-0 z-30">

        <button
          onClick={() =>
            setIsMenuOpen(true)
          }
          className="text-gray-700 hover:text-black cursor-pointer p-1"
        >
          <Menu className="w-6 h-6" />
        </button>

        <h1 className="text-base font-semibold text-gray-900">
          Dashboard
        </h1>

        <div className="flex items-center gap-2">

          <Link
            href="/history"
            className="p-1 text-gray-700 hover:text-blue-600"
          >
            <ChevronRight className="w-6 h-6 stroke-[2.5] text-black" />
          </Link>

          <button
            className="text-gray-700 hover:text-black cursor-pointer p-1"
          >
            <Bell className="w-6 h-6" />
          </button>

        </div>

      </header>

      {/* ==================================================
          USER PROFILE
      ================================================== */}

      <div className="mx-4 my-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">

        <div className="w-14 h-14 rounded-full bg-blue-100 flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-blue-600">

          {studentInitials}

        </div>

        <div className="flex flex-col">

          <h2 className="text-base font-bold text-gray-900 leading-tight">
            Hello, {studentFullName}
          </h2>

          <p className="text-xs text-gray-500 font-medium mt-0.5">

            Student ID:

            <span className="text-gray-700">
              {" "}
              {student.student_id}
            </span>

          </p>

          <p className="text-xs text-gray-500 font-medium">

            {student.Program ||
              "Programme not specified"}

          </p>

        </div>

      </div>

      {/* ==================================================
          BLE STATUS
      ================================================== */}

      <div className="mx-4 mb-4 rounded-xl bg-white border border-gray-200 p-3 shadow-sm">

        <div className="flex items-center gap-2">

          {teacherDetected ? (

            <Bluetooth className="w-4 h-4 text-emerald-600" />

          ) : (

            <BluetoothSearching className="w-4 h-4 text-blue-600 animate-pulse" />

          )}

          <p className="text-xs font-bold text-gray-700">
            Bluetooth
          </p>

        </div>

        <p
          className={`text-xs font-semibold mt-2 ${
            teacherConnected
              ? "text-emerald-600"
              : "text-blue-600"
          }`}
        >
          BLE: {bleStatus}
        </p>

        {teacherRssi !== null && (

          <p className="text-[11px] text-gray-500 mt-1">
            Signal: {teacherRssi} dBm
          </p>

        )}

        {teacherDeviceId && (

          <p className="text-[10px] text-gray-400 mt-1 break-all">
            Device: {teacherDeviceId}
          </p>

        )}

        {bleError && (

          <p className="text-[11px] text-red-600 mt-2 break-all">
            BLE Error: {bleError}
          </p>

        )}

        {/* BLE DEVICES */}

        <div className="border-t border-gray-100 my-3" />

        <div className="flex items-center justify-between">

          <p className="text-xs font-bold text-gray-700">
            BLE Devices Seen
          </p>

          <button
            onClick={() =>
              setDiscoveredDevices([])
            }
            className="text-[10px] text-blue-600 font-semibold"
          >
            Clear
          </button>

        </div>

        {discoveredDevices.length === 0 ? (

          <p className="text-[11px] text-gray-400 mt-2">
            No BLE devices received yet.
          </p>

        ) : (

          <div className="mt-2 space-y-2">

            {discoveredDevices.map(
              (device) => {

                const isTeacher =
                  device.deviceName
                    .trim()
                    .toLowerCase() ===
                  TEACHER_DEVICE_NAME.toLowerCase();

                const hasTeacherService =
                  device.uuids.some(
                    (uuid) =>
                      normalizeUuid(uuid) ===
                      normalizeUuid(
                        TEACHER_SERVICE_UUID
                      )
                  );

                const isPossibleTeacher =
                  isTeacher ||
                  hasTeacherService;

                return (

                  <div
                    key={
                      device.deviceId
                    }
                    className={`rounded-xl border p-3 ${
                      isPossibleTeacher
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >

                    <div className="flex items-center justify-between gap-2">

                      <p className="text-xs font-bold text-gray-800 break-words">
                        {device.deviceName}
                      </p>

                      {isPossibleTeacher && (

                        <span className="text-[9px] font-bold text-emerald-700 whitespace-nowrap">
                          TEACHER
                        </span>

                      )}

                    </div>

                    <p className="text-[10px] text-gray-500 mt-1 break-all">
                      ID: {device.deviceId}
                    </p>

                    <p className="text-[10px] text-gray-500">
                      RSSI:{" "}
                      {device.rssi !== null
                        ? `${device.rssi} dBm`
                        : "N/A"}
                    </p>

                    <p className="text-[10px] text-gray-500 break-all">
                      UUIDs:{" "}
                      {device.uuids.length > 0
                        ? device.uuids.join(", ")
                        : "None reported"}
                    </p>

                    {isPossibleTeacher && (

                      <p className="text-[10px] font-bold text-emerald-700 mt-1">
                        ✅ POSSIBLE TEACHER DEVICE
                      </p>

                    )}

                  </div>

                );
              }
            )}

          </div>

        )}

        {/* SESSION CONNECTION */}

        <div className="border-t border-gray-100 my-3" />

        <p className="text-xs font-bold text-gray-700">
          Session Connection
        </p>

        <p
          className={`text-xs font-semibold mt-2 ${
            teacherConnected
              ? "text-emerald-600"
              : "text-blue-600"
          }`}
        >
          {connectionStatus}
        </p>

        {attendanceSessionDetected && (

          <p className="text-[11px] text-gray-500 mt-2">
            Attendance session detected ✓
          </p>

        )}

        {absentRecorded && (

          <p className="text-[11px] text-red-600 font-semibold mt-2 flex items-center gap-1">

            <XCircle className="w-3 h-3" />

            Student marked ABSENT

          </p>

        )}

      </div>

      {/* ==================================================
          SESSION CONTENT
      ================================================== */}

      <div className="px-4 my-6">

        {/* SUCCESS */}

        {flowStep === "success" ? (

          <div className="bg-emerald-600 text-white rounded-3xl p-6 space-y-6 text-center shadow-lg">

            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto">

              <CheckCircle2 className="w-10 h-10 text-white" />

            </div>

            <h2 className="text-xl font-bold">
              Attendance Marked Successfully!
            </h2>

            <div className="bg-white/10 rounded-2xl p-4 text-xs text-left space-y-2 border border-white/10">

              <p>

                <span className="text-white/70">
                  Student:
                </span>{" "}

                {studentFullName}

              </p>

              <p>

                <span className="text-white/70">
                  Student ID:
                </span>{" "}

                {student.student_id}

              </p>

              <p>

                <span className="text-white/70">
                  Course:
                </span>{" "}

                {session?.courseName ||
                  "Database Systems"}

              </p>

              <p>

                <span className="text-white/70">
                  Teacher:
                </span>{" "}

                {session?.teacherName ||
                  "Unknown"}

              </p>

              <p>

                <span className="text-white/70">
                  Room:
                </span>{" "}

                {session?.room ||
                  "Unknown"}

              </p>

              <p>

                <span className="text-white/70">
                  Token:
                </span>{" "}

                <span className="font-mono font-bold">

                  {session?.activeToken ||
                    "N/A"}

                </span>

              </p>

              <p>

                <span className="text-white/70">
                  Status:
                </span>{" "}

                <span className="font-bold">
                  PRESENT
                </span>

              </p>

            </div>

            <button
              onClick={
                resetFlow
              }
              className="w-full py-3.5 bg-white text-emerald-700 font-bold rounded-2xl text-xs hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
            >
              Done / Back to Dashboard
            </button>

          </div>

        ) : session ? (

          /* ACTIVE SESSION */

          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">

            <div className="bg-emerald-50 text-emerald-700 text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center gap-2">

              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />

              <span>
                Session Found
              </span>

              <span className="text-[10px] text-emerald-600 font-normal ml-auto">
                BLE Connected
              </span>

            </div>

            <div className="space-y-4 pt-2">

              <div>

                <p className="text-[11px] text-gray-400 font-medium">
                  Course
                </p>

                <p className="text-base font-bold text-gray-900">
                  {session.courseName}
                </p>

              </div>

              <div>

                <p className="text-[11px] text-gray-400 font-medium">
                  Teacher
                </p>

                <p className="text-sm font-semibold text-gray-700">
                  {session.teacherName}
                </p>

              </div>

              <div>

                <p className="text-[11px] text-gray-400 font-medium">
                  Location
                </p>

                <p className="text-sm font-semibold text-gray-700">
                  {session.room}
                </p>

              </div>

              <div>

                <p className="text-[11px] text-gray-400 font-medium">
                  Current Token
                </p>

                <p className="text-lg font-mono font-bold text-emerald-600 break-all">
                  {session.activeToken}
                </p>

                <p className="text-[10px] text-gray-400 mt-1">
                  Updates automatically from BLE
                </p>

              </div>

            </div>

            <button
              onClick={
                handleMarkAttendance
              }
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl text-xs transition-colors shadow-sm cursor-pointer"
            >
              Mark Attendance
            </button>

          </div>

        ) : (

          /* NO ACTIVE SESSION */

          <div className="flex flex-col items-center justify-center text-center py-10">

            <div
              className={`w-28 h-28 mb-6 rounded-full flex items-center justify-center ${
                absentRecorded
                  ? "bg-red-50"
                  : "bg-blue-50"
              }`}
            >

              {absentRecorded ? (

                <XCircle className="w-14 h-14 text-red-500" />

              ) : teacherDetected ? (

                <Bluetooth className="w-14 h-14 text-emerald-500" />

              ) : (

                <BluetoothSearching className="w-14 h-14 text-blue-500 animate-pulse" />

              )}

            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-1">

              {absentRecorded
                ? "Attendance Not Marked"
                : teacherDetected
                ? "Teacher Detected"
                : "Searching for Teacher"}

            </h3>

            <p className="text-xs text-gray-500 max-w-xs">

              {absentRecorded
                ? "The attendance session ended before you marked attendance."
                : teacherDetected
                ? "Connected to the teacher and reading the attendance session..."
                : "Bluetooth is scanning automatically for an active teacher attendance session."}

            </p>

          </div>

        )}

      </div>

      {/* ==================================================
          AUTHENTICATION METHOD SELECTION
      ================================================== */}

      {flowStep === "auth" && (

        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end justify-center z-50">

          <div className="bg-white w-full max-w-md rounded-t-3xl p-6 space-y-5 text-center">

            {/* HEADER */}

            <div className="flex items-center justify-center">

              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">

                <ScanFace className="w-7 h-7 text-blue-600" />

              </div>

            </div>

            <div>

              <h3 className="text-lg font-bold text-gray-900">
                Verify Your Identity
              </h3>

              <p className="text-xs text-gray-500 mt-1">
                Choose your preferred authentication method
              </p>

            </div>

            {/* ERROR */}

            {attendanceError && (

              <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3 text-left">

                <p className="font-bold mb-1">
                  Authentication failed
                </p>

                <p>
                  {attendanceError}
                </p>

              </div>

            )}

            {/* DEVICE STATUS */}

            {biometricInfo && (

              <div
                className={`rounded-xl p-3 text-left border ${
                  biometricInfo.isAvailable
                    ? "bg-emerald-50 border-emerald-100"
                    : biometricInfo.deviceIsSecure
                      ? "bg-blue-50 border-blue-100"
                      : "bg-amber-50 border-amber-100"
                }`}
              >

                <p className="text-[10px] font-bold text-gray-700">
                  Device authentication
                </p>

                <p className="text-[10px] text-gray-500 mt-1">
                  {biometricInfo.isAvailable
                    ? "Biometric authentication is available to this app."
                    : biometricInfo.deviceIsSecure
                      ? "No usable biometric is available, but this phone has a secure screen lock."
                      : "No usable biometric or secure screen lock is currently available to this app."}
                </p>

              </div>

            )}

            {/* ==================================================
                AUTHENTICATION OPTIONS
            ================================================== */}

            {biometricInfo?.isAvailable ? (
              <>

                {/* FINGERPRINT OPTION */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAuthMethod(
                      "fingerprint"
                    );
                    setAttendanceError("");
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedAuthMethod ===
                    "fingerprint"
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-blue-300"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Fingerprint className="w-7 h-7 text-blue-600" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">
                      Fingerprint / Biometric
                    </p>

                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Authenticate using a biometric method supported by this phone
                    </p>
                  </div>

                  {selectedAuthMethod ===
                    "fingerprint" && (
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                  )}
                </button>

                {/* FACE OPTION */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAuthMethod(
                      "face"
                    );
                    setAttendanceError("");
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedAuthMethod ===
                    "face"
                      ? "border-purple-600 bg-purple-50"
                      : "border-gray-200 bg-white hover:border-purple-300"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <ScanFace className="w-7 h-7 text-purple-600" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">
                      Face / Biometric
                    </p>

                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Authenticate using a biometric method supported by this phone
                    </p>
                  </div>

                  {selectedAuthMethod ===
                    "face" && (
                    <CheckCircle2 className="w-5 h-5 text-purple-600" />
                  )}
                </button>

              </>
            ) : biometricInfo?.deviceIsSecure ? (

              <button
                type="button"
                onClick={() => {
                  setSelectedAuthMethod(
                    "device"
                  );
                  setAttendanceError("");
                }}
                className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                  selectedAuthMethod === "device"
                    ? "border-blue-600 bg-blue-50"
                    : "border-blue-200 bg-blue-50 hover:border-blue-400"
                }`}
              >

                <div className="flex items-center gap-3">

                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-7 h-7 text-blue-600" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">
                      Use Device PIN / Screen Lock
                    </p>

                    <p className="text-[11px] text-gray-600 mt-0.5">
                      This phone has a secure screen lock. We will use Android device authentication in the next step.
                    </p>
                  </div>

                  {selectedAuthMethod === "device" && (
                    <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  )}

                </div>

              </button>

            ) : (

              <div className="w-full rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-left">

                <div className="flex items-center gap-3">

                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                    <XCircle className="w-7 h-7 text-red-500" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">
                      No Secure Authentication Available
                    </p>

                    <p className="text-[11px] text-gray-600 mt-0.5">
                      This phone has no usable biometric method and no secure screen lock. Attendance cannot be verified on this device.
                    </p>
                  </div>

                </div>

              </div>

            )}

            {/* ==================================================
                CONTINUE
            ================================================== */}

            <button
              type="button"
              onClick={
                handleConfirmBiometrics
              }
              disabled={
                !selectedAuthMethod ||
                !biometricInfo ||
                (selectedAuthMethod !== "device" &&
                  !biometricInfo.isAvailable) ||
                (selectedAuthMethod === "device" &&
                  !biometricInfo.deviceIsSecure)
              }
              className={`w-full py-3.5 rounded-2xl text-xs font-bold transition-colors ${
                selectedAuthMethod &&
                biometricInfo &&
                (
                  (selectedAuthMethod !== "device" &&
                    biometricInfo.isAvailable) ||
                  (selectedAuthMethod === "device" &&
                    biometricInfo.deviceIsSecure)
                )
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              Continue
            </button>

            <p className="text-[10px] text-gray-400">
              Android will perform the secure authentication.
            </p>

          </div>

        </div>

      )}

      {/* ==================================================
          VERIFYING
      ================================================== */}

      {flowStep === "verifying" && (

        <div className="fixed inset-0 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center z-50 space-y-4">

          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />

          <h3 className="text-sm font-bold text-gray-800">
            Marking Attendance...
          </h3>

          <div className="text-xs text-gray-500 space-y-1.5 text-left bg-gray-50 p-4 rounded-xl border border-gray-100">

            <p className="text-emerald-600 font-medium">
              ✓ Teacher detected via BLE
            </p>

            <p className="text-emerald-600 font-medium">
              ✓ Attendance session read
            </p>

            <p className="text-emerald-600 font-medium">
              ✓ Secure authentication successful
            </p>

            <p className="text-blue-600 font-medium animate-pulse">
              ⏳ Recording Attendance...
            </p>

          </div>

        </div>

      )}

      {/* ==================================================
          DRAWER BACKDROP
      ================================================== */}

      {isMenuOpen && (

        <div
          onClick={() =>
            setIsMenuOpen(false)
          }
          className="fixed inset-0 bg-black/50 z-50"
        />

      )}

      {/* ==================================================
          DRAWER
      ================================================== */}

      <aside
        className={`fixed top-0 left-0 bottom-0 w-3/4 max-w-xs bg-white z-50 shadow-xl flex flex-col justify-between py-8 px-5 transition-transform duration-300 ease-in-out ${
          isMenuOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >

        <div className="space-y-6">

          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">

            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">

              {studentInitials}

            </div>

            <div>

              <h2 className="font-semibold text-gray-900 leading-tight">
                {studentFullName}
              </h2>

              <p className="text-xs text-gray-500">
                {student.student_id}
              </p>

            </div>

          </div>

          <nav className="flex flex-col gap-4">

            <Link
              href="/home"
              onClick={() =>
                setIsMenuOpen(false)
              }
              className="flex items-center gap-3 text-gray-800 font-medium hover:text-blue-600"
            >
              <HomeIcon className="w-5 h-5 text-gray-500" />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/history"
              onClick={() =>
                setIsMenuOpen(false)
              }
              className="flex items-center gap-3 text-gray-800 font-medium hover:text-blue-600"
            >
              <Clock className="w-5 h-5 text-gray-500" />
              <span>Attendance History</span>
            </Link>

            <Link
              href="/profile"
              onClick={() =>
                setIsMenuOpen(false)
              }
              className="flex items-center gap-3 text-gray-800 font-medium hover:text-blue-600"
            >
              <User className="w-5 h-5 text-gray-500" />
              <span>My Profile</span>
            </Link>

            <Link
              href="/settings"
              onClick={() =>
                setIsMenuOpen(false)
              }
              className="flex items-center gap-3 text-gray-800 font-medium hover:text-blue-600"
            >
              <Settings className="w-5 h-5 text-gray-500" />
              <span>Settings</span>
            </Link>

            <Link
              href="/support"
              onClick={() =>
                setIsMenuOpen(false)
              }
              className="flex items-center gap-3 text-gray-800 font-medium hover:text-blue-600"
            >
              <HelpCircle className="w-5 h-5 text-gray-500" />
              <span>Help & Support</span>
            </Link>

            <Link
              href="/about"
              onClick={() =>
                setIsMenuOpen(false)
              }
              className="flex items-center gap-3 text-gray-800 font-medium hover:text-blue-600"
            >
              <Info className="w-5 h-5 text-gray-500" />
              <span>About App</span>
            </Link>

          </nav>

        </div>

        <button
          onClick={
            handleLogout
          }
          className="flex items-center gap-3 text-red-500 font-medium pt-4 border-t border-gray-100 cursor-pointer"
        >

          <LogOut className="w-5 h-5" />

          <span>Logout</span>

        </button>

      </aside>

      {/* ==================================================
          BOTTOM NAVIGATION
      ================================================== */}

      <section className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4 flex justify-around items-center z-40">

       <Link
  href="/home"
  className={
    pathname === "/home"
      ? "flex flex-col items-center gap-1 text-blue-600"
      : "flex flex-col items-center gap-1 text-gray-400 hover:text-blue-600"
  }
>
  <HomeIcon className="w-5 h-5" />
  <span className="text-[11px] font-semibold">
    Home
  </span>
</Link>

  <Link
             href="/history"
                className={
                pathname === "history"
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
          className={
            pathname === "/profile"
              ? "flex flex-col items-center gap-1 text-black"
              : "flex flex-col items-center gap-1 text-gray-400 hover:text-blue-600"
          }
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
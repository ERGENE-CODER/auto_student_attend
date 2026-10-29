import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.autoattendance.system",
  appName: "Auto Attendance System",
  webDir: "out",
  android: {
    allowMixedContent: true,
  },
};

export default config;
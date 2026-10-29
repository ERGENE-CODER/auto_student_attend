"use client";
import Link from "next/link";
import image from"next/image";
import {useState} from "react";
import { Smartphone, KeyRound,ChevronRight,ChevronLeft, Pencil, Home, } from "lucide-react";
import{Home as HomeIcon,Clock,User} from "lucide-react";


export default function profilepage(){

const [activeTab, setActiveTab] = useState("profile")

return (
<main className="min-h-screen bg-gray-50 flex flex-col justify-between pb-20">

      {/* Top Header */}
<div className="relative flex items-center justify-center py-5 px-4 bg-white border-b border-gray-200 shadow-sm">

  <Link
    href="/history"
    className="absolute left-4 p-2 rounded-xl hover:bg-blue-50 transition-colors"
  >
    <ChevronLeft className="w-6 h-6 stroke-[2.5] text-black" />
  </Link>

  <h1 className="text-[20px] font-bold text-black">
    Profile
  </h1>

</div>
      {/* Main Profile Content */}
      <div className="px-5 space-y-6 flex-1">
        {/* User Info Header */}
        <div className="flex flex-col items-center text-center mt-2">
          {/* Avatar with Edit Badge */}
          <div className="relative mb-3">
            <div className="w-24 h-24 rounded-full bg-blue-100 overflow-hidden flex items-center justify-center border-2 border-white shadow-sm">
              <img 
                src="/caartoon.png" 
                alt="John Doe" 
                className="w-full h-full object-cover" 
              />
            </div>
            {/* Edit Pencil Icon Button */}
            <button className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow-md border border-gray-100 text-blue-600 hover:bg-gray-50 cursor-pointer">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>

          <h2 className="text-xl font-bold text-black text-[20px]">John Doe</h2>
          <p className="text-xs text-black font-medium mt-1 text-[15px]">
            Student ID: <span className="text-gray-700">20260023</span>
          </p>
          <p className="text-xs text-black font-medium text-[15px]">
            BSc. Computer Science
          </p>
        </div>

        {/* Navigation Action Group Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
          
          {/* 1. Personal Information */}
          <button className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left cursor-pointer">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-black" />
              <span className="text-sm font-semibold text-gray-800">
                Personal Information
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          {/* 2. Registered Device */}
          <button className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left cursor-pointer">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-black" />
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Registered Device
                </p>
                <p className="text-xs text-black font-normal">
                  This iPhone 14
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          {/* 3. Change Password */}
          <button className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left cursor-pointer">
            <div className="flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-black" />
              <span className="text-sm font-semibold text-gray-800">
                Change Password
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

        </div>

      </div>
              {/* 3. BOTTOM NAVIGATION BAR */}
       <section className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4 flex justify-around items-center z-40">
       
               <Link
                 href="/"
                 className="flex flex-col items-center gap-1 text-gray-400 hover:text-blue-600"
               >
                 <HomeIcon className="w-5 h-5" />
       
                 <span className="text-[11px] font-semibold">
                   Home
                 </span>
               </Link>
       
               <Link
                 href="/history"
                 className="flex flex-col items-center gap-1 text-gray-400 hover:text-blue-600"
               >
                 <Clock className="w-5 h-5" />
       
                 <span className="text-[11px] font-semibold">
                   History
                 </span>
               </Link>
               
              <Link
             href="/profile"
               className={
               activeTab === "profile"
                ? "flex flex-col items-center gap-1 text-blue-600"
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
    )
}

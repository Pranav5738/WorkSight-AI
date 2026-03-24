# CONTEXA VISION - Quick Setup Guide

## Getting Started in 3 Steps

### Step 1: Start the Development Server

The application is ready to run. Simply execute:

```bash
npm run dev
```

Then open your browser to: `http://localhost:5173`

### Step 2: Login

Use the demo credentials:
- **Username**: `admin`
- **Password**: `demo123`

### Step 3: Explore Features

Navigate through the sidebar to explore:
1. **Dashboard** - Overview and quick actions
2. **Attendance System**
3. **Attendance System** - AI-powered attendance
4. **System Logs** - Activity monitoring

---

## Camera Permissions

When accessing camera features:

1. Browser will request camera permission
2. Click "Allow" to enable live camera feed
3. If denied, the app uses a simulated feed (works perfectly for demo)

**Note**: Camera access requires HTTPS in production. Development server works with HTTP.

---

## Theme Toggle

Click the sun/moon icon in the header to switch between light and dark modes. Your preference is automatically saved.

---

## Database Features

The application includes:
- ✅ 10 pre-loaded sample employees
- ✅ Real-time data synchronization
- ✅ Secure Row Level Security (RLS)
- ✅ Automatic attendance tracking
 

---

## Testing the Features

### Attendance System
1. Navigate to "Attendance System"
2. Camera automatically scans every 5 seconds
3. Randomly marks attendance for employees
4. Watch the Present/Absent counters update
5. Filter employees by status (All, Present, Absent, Late)
6. Click "Export" to download attendance report

### System Logs
1. Navigate to "System Logs"
2. View all system activities
3. Filter by type (All, Auth, Attendance, Security, System)
4. Click on "View metadata" to see event details
5. Export logs as CSV

---

## Optional: Google Gemini AI Integration

To enable real facial recognition:

### 1. Get API Key
Visit: https://makersuite.google.com/app/apikey

### 2. Add to .env file
```env
VITE_GEMINI_API_KEY=your_api_key_here
```

### 3. Install package
```bash
npm install @google/generative-ai
```

### 4. Implementation
See `src/pages/AttendanceSystem.tsx` for integration points. Replace the simulation logic with Gemini AI calls for real facial recognition.

---

## Production Build

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

Deploy the `dist` folder to any static hosting service (Vercel, Netlify, etc.)

---

## Responsive Design

The application is fully responsive:
- **Mobile** (< 640px): Optimized layout
- **Tablet** (640-1024px): Enhanced layout
- **Desktop** (> 1024px): Full-featured layout

Try resizing your browser window to see the responsive design in action!

---

## Key Keyboard Shortcuts

- **Esc** - Close modals/dialogs
- **Tab** - Navigate through interactive elements
- **Enter** - Submit forms/confirm actions

---

## Common Issues & Solutions

### Camera not accessible
**Solution**: Grant camera permission when prompted, or use the simulated feed (works great for demo)

### Theme not persisting
**Solution**: Check browser localStorage is enabled

### Data not loading
**Solution**: Check internet connection and Supabase status

### Build warnings
**Solution**: Normal for development; production build removes all warnings

---

## Project Architecture

```
CONTEXA VISION
│
├── Authentication Layer (Login → Auth Context)
├── Theme Management (Light/Dark Mode)
├── Routing (Dashboard, Attendance, Logs)
├── Database Layer (Supabase PostgreSQL)
└── UI Components (Reusable & Modular)
```

---

## Next Steps

1. ✅ **Explore all features** - Navigate through each module
2. ✅ **Test responsiveness** - Try on different screen sizes
3. ✅ **Try both themes** - Toggle light/dark mode
4. ✅ **Export reports** - Download CSV files
5. ⚡ **Customize** - Modify components to fit your needs

---

## Need Help?

Check the main README.md for:
- Detailed feature documentation
- API integration guides
- Troubleshooting steps
- Architecture details

---

**Enjoy using CONTEXA VISION!** 🚀

import React, { useState, useRef, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from '@/lib/utils';

export default function MobileSelect({ value, onValueChange, placeholder, children, className, isMobile = false }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef(null);

  // Detect mobile
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileDevice(window.innerWidth < 768 || isMobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isMobile]);

  const extractOptions = () => {
    return React.Children.toArray(children).filter(
      child => child?.type?.displayName === 'SelectItem'
    );
  };

  const handleSelect = (selectedValue) => {
    onValueChange(selectedValue);
    setDrawerOpen(false);
  };

  if (!isMobileDevice) {
    return (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn("h-8 rounded-lg text-xs bg-white border-gray-200", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {children}
        </SelectContent>
      </Select>
    );
  }

  const selectedLabel = React.Children.toArray(children).find(
    child => child?.props?.value === value
  )?.props?.children;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setDrawerOpen(true)}
        className={cn(
          "h-8 rounded-lg text-xs bg-white border border-gray-200 px-3 text-left flex items-center justify-between w-full text-gray-700",
          className
        )}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <span className="text-gray-400 ml-2">▼</span>
      </button>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b border-gray-200">
            <DrawerTitle className="text-sm">{placeholder}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
            {React.Children.toArray(children).map(child => {
              if (child?.type?.displayName === 'SelectItem') {
                const isSelected = child.props.value === value;
                return (
                  <button
                    key={child.props.value}
                    onClick={() => handleSelect(child.props.value)}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                      isSelected
                        ? "bg-gray-900 text-white"
                        : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    {child.props.children}
                  </button>
                );
              }
              return null;
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
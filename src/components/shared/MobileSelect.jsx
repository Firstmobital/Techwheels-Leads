// @ts-nocheck
import React, { useState, useRef, useEffect } from'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from"@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from"@/components/ui/drawer";
import { cn } from'@/lib/utils';

/**
 * @param {{
 *  value?: string,
 *  onValueChange: (value: string) => void,
 *  placeholder?: React.ReactNode,
 *  children: React.ReactNode,
 *  className?: string,
 *  isMobile?: boolean
 * }} props
 */
export default function MobileSelect({ value, onValueChange, placeholder, children, className, isMobile = false }) {
 const [drawerOpen, setDrawerOpen] = useState(false);
 const triggerRef = useRef(null);
 const SelectTriggerComp = /** @type {any} */ (SelectTrigger);
 const SelectContentComp = /** @type {any} */ (SelectContent);
 const DrawerContentComp = /** @type {any} */ (DrawerContent);
 const DrawerTitleComp = /** @type {any} */ (DrawerTitle);

 const optionElements = /** @type {Array<React.ReactElement<{ value: string, children?: React.ReactNode }>>} */ (
 React.Children.toArray(children).filter((child) => {
 return React.isValidElement(child) && child.type === SelectItem;
 })
 );

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

 const handleSelect = (selectedValue) => {
 onValueChange(selectedValue);
 setDrawerOpen(false);
 };

 if (!isMobileDevice) {
 return (
 <Select value={value} onValueChange={onValueChange}>
 <SelectTriggerComp className={cn("h-8 rounded-lg text-xs bg-white border-gray-200", className)}>
 <SelectValue placeholder={placeholder} />
 </SelectTriggerComp>
 <SelectContentComp>
 {children}
 </SelectContentComp>
 </Select>
 );
 }

 const selectedOption = optionElements.find((child) => child.props.value === value);
 const selectedLabel = selectedOption?.props?.children;

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
 <DrawerContentComp>
 <DrawerHeader className="border-b border-gray-200">
 <DrawerTitleComp className="text-sm">{placeholder}</DrawerTitleComp>
 </DrawerHeader>
 <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
 {optionElements.map(child => {
 const isSelected = child.props.value === value;
 return (
 <button
 key={child.props.value}
 onClick={() => handleSelect(child.props.value)}
 className={cn(
"w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors",
 isSelected
 ?"bg-gray-900 text-white"
 :"bg-gray-50 text-gray-700 hover:bg-gray-100"
 )}
 >
 {child.props.children}
 </button>
 );
 })}
 </div>
 </DrawerContentComp>
 </Drawer>
 </>
 );
}
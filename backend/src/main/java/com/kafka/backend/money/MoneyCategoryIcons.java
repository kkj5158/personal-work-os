package com.kafka.backend.money;

import java.util.Set;
import static com.kafka.backend.money.MoneyService.*;

/** Typed presentation values; asset uploads remain disabled until their storage lifecycle exists. */
final class MoneyCategoryIcons {
 static final Set<String> ICONS=Set.of("coffee","utensils","home","car","train","shopping-bag","heart","book","plane","gift","briefcase","phone","receipt","wallet","banknote","piggy-bank","landmark","graduation-cap","music","gamepad","dumbbell","shirt","monitor","wrench","baby","paw-print","flower","globe","circle","star","Utensils","Soup","Pizza","Salad","Coffee","CupSoda","Croissant","Cookie","House","Building","BedDouble","Sofa","Car","Bus","TrainFront","Bike","ShoppingBag","ShoppingCart","Shirt","Store","Pill","Hospital","Stethoscope","HeartPulse","Dumbbell","Trophy","Volleyball","Activity","BookOpen","GraduationCap","School","Pencil","Clapperboard","Music","Headphones","Palette","Plane","Luggage","Hotel","Tent","Gift","Cake","Flower","Handshake","BriefcaseBusiness","Monitor","Laptop","Printer","Tv","Smartphone","Repeat","Bell","Lightbulb","Plug","Droplets","Flame","Banknote","Coins","Receipt","Wallet","Factory","ClipboardList","ChartColumn","Phone","PiggyBank","Landmark","Vault","Target","TrendingUp","TrendingDown","ChartNoAxesCombined","Scale","ArrowLeftRight","Send","CreditCard","ArrowDownUp","FileText","ScrollText","Hourglass","CircleAlert");
 record Icon(String type,String value){}
 static Icon normalize(String type,String value,String legacy){
  if(type==null){text(legacy,32,false,"Emoji");return legacy==null||legacy.isBlank()?new Icon(null,null):new Icon("EMOJI",legacy);}
  require(Set.of("EMOJI","ICON").contains(type),"Custom assets are not available");
  text(value,type.equals("EMOJI")?32:64,true,"Icon");
  require(!value.contains("://")&&!value.startsWith("data:"),"External image URLs are not icon values");
  require(type.equals("EMOJI")||ICONS.contains(value),"Unknown internal icon");
  return new Icon(type,value);
 }
}

import dawnBlade from "@/assets/servers/dawn-blade.png";
import nanoCore from "@/assets/servers/nano-core.png";
import sparkNode from "@/assets/servers/spark-node.png";
import pulseUnit from "@/assets/servers/pulse-unit.png";
import arcaneShield from "@/assets/servers/arcane-shield.png";
import vortexHub from "@/assets/servers/vortex-hub.png";
import blazeEngine from "@/assets/servers/blaze-engine.png";
import stormRack from "@/assets/servers/storm-rack.png";
import titanFrame from "@/assets/servers/titan-frame.png";
import natureStaff from "@/assets/servers/nature-staff.png";
import phantomGrid from "@/assets/servers/phantom-grid.png";
import novaCluster from "@/assets/servers/nova-cluster.png";
import hyperMatrix from "@/assets/servers/hyper-matrix.png";
import quantumForge from "@/assets/servers/quantum-forge.png";
import omegaTower from "@/assets/servers/omega-tower.png";
import eclipseVault from "@/assets/servers/eclipse-vault.png";
import infinityCore from "@/assets/servers/infinity-core.png";
import genesisPrime from "@/assets/servers/genesis-prime.png";
import stormAxe from "@/assets/servers/storm-axe.png";
import server1 from "@/assets/servers/server-1.png";

const weaponImageMap: Record<string, string> = {
  "Dawn Blade": dawnBlade,
  "dawn-blade": dawnBlade,
  "Nano Core": nanoCore,
  "nano-core": nanoCore,
  "Spark Node": sparkNode,
  "spark-node": sparkNode,
  "Pulse Unit": pulseUnit,
  "pulse-unit": pulseUnit,
  "Arcane Shield": arcaneShield,
  "arcane-shield": arcaneShield,
  "Vortex Hub": vortexHub,
  "vortex-hub": vortexHub,
  "Blaze Engine": blazeEngine,
  "blaze-engine": blazeEngine,
  "Storm Rack": stormRack,
  "storm-rack": stormRack,
  "Titan Frame": titanFrame,
  "titan-frame": titanFrame,
  "Nature Staff": natureStaff,
  "nature-staff": natureStaff,
  "Phantom Grid": phantomGrid,
  "phantom-grid": phantomGrid,
  "Nova Cluster": novaCluster,
  "nova-cluster": novaCluster,
  "Hyper Matrix": hyperMatrix,
  "hyper-matrix": hyperMatrix,
  "Quantum Forge": quantumForge,
  "quantum-forge": quantumForge,
  "Omega Tower": omegaTower,
  "omega-tower": omegaTower,
  "Eclipse Vault": eclipseVault,
  "eclipse-vault": eclipseVault,
  "Infinity Core": infinityCore,
  "infinity-core": infinityCore,
  "Genesis Prime": genesisPrime,
  "genesis-prime": genesisPrime,
  "Storm Axe": stormAxe,
  "storm-axe": stormAxe,
};

interface ServerArtworkProps {
  name: string;
  rarity: string;
  imageUrl?: string;
  className?: string;
}

const rarityGlowMap: Record<string, string> = {
  legendary: "drop-shadow-[0_0_1rem_hsl(var(--gold)/0.55)]",
  epic: "drop-shadow-[0_0_0.85rem_hsl(var(--primary)/0.45)]",
  rare: "drop-shadow-[0_0_0.75rem_hsl(var(--ton-blue)/0.42)]",
  common: "drop-shadow-[0_0_0.6rem_hsl(var(--foreground)/0.18)]",
};

const ServerArtwork = ({ name, rarity, imageUrl, className = "" }: ServerArtworkProps) => {
  const isDirect = !!imageUrl && (imageUrl.startsWith("/") || imageUrl.startsWith("http"));
  const imgSrc = isDirect ? (imageUrl as string) : weaponImageMap[imageUrl || ""] || weaponImageMap[name] || server1;

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={imgSrc}
        alt={`${name} NFT artwork`}
        className={`${isDirect ? "w-28 h-28 rounded-2xl object-cover border border-border/60" : "w-24 h-24 object-contain"} ${rarityGlowMap[rarity] || rarityGlowMap.common}`}
        loading="lazy"
      />
    </div>
  );
};

export default ServerArtwork;

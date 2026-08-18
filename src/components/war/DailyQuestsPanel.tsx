import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DAILY_QUESTS, loadQuests, claimQuest } from "@/lib/war-quests";
import { Target } from "lucide-react";

interface Props { onClaim: (rewardTon: number) => void; }

export const DailyQuestsPanel = ({ onClaim }: Props) => {
  const [state, setState] = useState(loadQuests());

  const refresh = () => setState(loadQuests());

  const handleClaim = (id: string, reward: number) => {
    claimQuest(id);
    onClaim(reward);
    refresh();
  };

  return (
    <Sheet onOpenChange={(o) => o && refresh()}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl gap-1 text-xs">
          <Target className="w-3 h-3" /> Quests
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Daily War Quests</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          {DAILY_QUESTS.map((q) => {
            const prog = state.progress[q.id] || 0;
            const claimed = state.claimed[q.id];
            const done = prog >= q.target;
            return (
              <div key={q.id} className="glass rounded-2xl p-3">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="text-sm font-display">{q.title}</div>
                    <div className="text-xs text-ton-blue font-display">+{q.rewardTon} Gram</div>
                  </div>
                  <Button
                    size="sm"
                    disabled={!done || claimed}
                    onClick={() => handleClaim(q.id, q.rewardTon)}
                    className="rounded-xl text-xs"
                  >
                    {claimed ? "Claimed" : done ? "Claim" : `${prog}/${q.target}`}
                  </Button>
                </div>
                <Progress value={(prog / q.target) * 100} className="h-1.5" />
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-4 font-display">
          Resets daily at 00:00 UTC
        </p>
      </SheetContent>
    </Sheet>
  );
};
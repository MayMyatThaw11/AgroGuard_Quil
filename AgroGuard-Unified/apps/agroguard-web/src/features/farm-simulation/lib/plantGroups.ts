/**
 * The five model groups served by the plant disease detection service
 * (port 8001). Each group is its own classifier, so the caller picks the
 * group first; naming the crop narrows the result further. Mirrors
 * PLANT_GROUPS in apps/agroguard-web/src/pages/DiseaseDetectionPage.jsx.
 */

export interface PlantGroup {
  id: string;
  name: { en: string; my: string };
  tip: { en: string; my: string };
  crops: ReadonlyArray<{ id: string; en: string; my: string }>;
}

export const PLANT_GROUPS: ReadonlyArray<PlantGroup> = [
  {
    id: 'Group_1_Grains_Legumes_Oilseeds',
    name: { en: 'Grains, Legumes & Oilseeds', my: 'နှံစားသီးနှံ၊ ပဲမျိုးစုံနှင့် ဆီထွက်သီးနှံများ' },
    tip: {
      en: 'Capture a clear close-up of the leaf blade, sheath, or upper foliage.',
      my: 'အရွက်ပြား၊ အရွက်ဖုံး သို့မဟုတ် အပေါ်ပိုင်းအရွက်များကို အနီးကပ် ကြည်လင်စွာ ရိုက်ယူပါ။',
    },
    crops: [
      { id: 'Rice', en: 'Rice', my: 'စပါး' },
      { id: 'Corn (Maize)', en: 'Corn (Maize)', my: 'ပြောင်းဖူး' },
      { id: 'Soybean', en: 'Soybean', my: 'ပဲပုပ်' },
      { id: 'Peanut (Groundnut)', en: 'Peanut (Groundnut)', my: 'မြေပဲ' },
      { id: 'Sesame', en: 'Sesame', my: 'နှမ်း' },
    ],
  },
  {
    id: 'Group_2_Palms_Industrial_Trees',
    name: { en: 'Palms, Industrial Trees & Vines', my: 'အုန်း၊ ဆီအုန်း၊ စက်မှုသီးနှံပင်ကြီးများနှင့် နွယ်ပင်များ' },
    tip: {
      en: 'Photograph affected frond leaflets, tree leaves, or lower trunk/stem lesions.',
      my: 'ရောဂါကျနေသော အရွက်များ သို့မဟုတ် ပင်စည်အနာကွက်များကို ဓာတ်ပုံရိုက်ပါ။',
    },
    crops: [
      { id: 'Coconut', en: 'Coconut', my: 'အုန်းပင်' },
      { id: 'Oil Palm', en: 'Oil Palm', my: 'ဆီအုန်း' },
      { id: 'Rubber', en: 'Rubber', my: 'ရာဘာ' },
      { id: 'Cashew', en: 'Cashew', my: 'သီဟိုဠ်သရက်' },
      { id: 'Black Pepper', en: 'Black Pepper', my: 'ငရုတ်ကောင်း' },
    ],
  },
  {
    id: 'Group_3_Beverage_Sugar_Root_Crops',
    name: { en: 'Beverage, Sugar & Root Crops', my: 'ဖျော်ရည်သီးနှံ၊ ကြံနှင့် ဥစားသီးနှံများ' },
    tip: {
      en: 'Photograph the upper leaf surface, sugarcane stalk, or cacao pod surface.',
      my: 'အရွက်မျက်နှာပြင်၊ ကြံပင်စည် သို့မဟုတ် ကိုကိုးသီးများကို ကြည်လင်စွာ ရိုက်ယူပါ။',
    },
    crops: [
      { id: 'Cassava', en: 'Cassava', my: 'ပီလောပီနံ' },
      { id: 'Coffee', en: 'Coffee', my: 'ကော်ဖီ' },
      { id: 'Sugarcane', en: 'Sugarcane', my: 'ကြံ' },
      { id: 'Tea', en: 'Tea', my: 'လက်ဖက်' },
      { id: 'Cacao', en: 'Cacao', my: 'ကိုကိုး' },
    ],
  },
  {
    id: 'Group_4_Orchard_Tree_Fruits',
    name: { en: 'Orchard & Tree Fruits', my: 'ဥယျာဉ်ခြံထွက် သစ်သီးဝလံပင်များ' },
    tip: {
      en: 'Supports leaf photos for all crops, plus direct fruit skin photos for Mango.',
      my: 'အပင်အားလုံးအတွက် အရွက်ပုံ စစ်ဆေးနိုင်ပြီး သရက်ပင်အတွက် အရွက်ရော အသီးပါ စစ်ဆေးနိုင်သည်။',
    },
    crops: [
      { id: 'Banana', en: 'Banana', my: 'ငှက်ပျော' },
      { id: 'Durian', en: 'Durian', my: 'ဒူးရင်း' },
      { id: 'Mango', en: 'Mango', my: 'သရက်' },
      { id: 'Papaya', en: 'Papaya', my: 'သင်္ဘော' },
      { id: 'Dragon Fruit', en: 'Dragon Fruit', my: 'နဂါးမောက်' },
    ],
  },
  {
    id: 'Group_5_Vegetables_Vine_Fruits',
    name: { en: 'Vegetables & Vine Fruits', my: 'ဟင်းသီးဟင်းရွက်နှင့် နွယ်ပင်သီးနှံများ' },
    tip: {
      en: 'Supports both leaf and fruit photos for Tomato and Chili / Bell Pepper.',
      my: 'ခရမ်းချဉ်နှင့် ငရုတ်ပင်တို့အတွက် အရွက်ရော အသီးပါ တင်၍ စစ်ဆေးနိုင်သည်။',
    },
    crops: [
      { id: 'Tomato', en: 'Tomato', my: 'ခရမ်းချဉ်' },
      { id: 'Pepper / Chili', en: 'Pepper / Chili', my: 'ငရုတ်' },
      { id: 'Eggplant', en: 'Eggplant', my: 'ခရမ်း' },
      { id: 'Pineapple', en: 'Pineapple', my: 'နာနတ်' },
      { id: 'Watermelon', en: 'Watermelon', my: 'ဖရဲ' },
    ],
  },
];

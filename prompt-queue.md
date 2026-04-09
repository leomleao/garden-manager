## First
I've added someone changes to the weather overview and API call, this means we will have even more information available in the app. Can we use this in the calendar tab? 
I want you to check all the fields we're pulling from the weather API calls and add information to the seeds sow-now-meta

Specifically we have the sow indoors now and sow outdoors now, I want to add tooltips based on the weather info we have. Examples here:
1. "Sow Outdoors Now" Tooltip (The Soil Gatekeeper)This is the most critical logic. Just because it is "April" (within the sow_outdoors_start window) doesn't mean the soil is ready.Logic: Compare optimum_soil_temp from your DB to the API’s soil_temperature_6cm.The Tooltip Content:Condition A (Too Cold): "Calendar says YES, but Soil says NO. Soil is 7.4°C; {seed.name} needs {seed.optimum_soil_temp} to germinate. Wait for a warmer spell to avoid seed rot."Condition B (Frost Risk): "Soil is warm enough, but a frost alert is active for Monday. If these germinate in {seed.days_to_germinate} days, they might hit a late freeze. Consider cloche protection."Condition C (Perfect): "Perfect conditions! Soil temp is ideal and rain today will help settle the seeds."
2. "Sow Indoors Now" Tooltip (The Light & Heat Logic)Indoor sowing is less about the weather outside and more about the growing conditions the user can provide.Logic: Use shortwave_radiation and uv_index to determine if windowsill light is enough.The Tooltip Content:Condition (Low Light): "Sow now, but use grow lights. Next 4 days are 90% overcast; windowsill light won't be enough to prevent 'leggy' (weak) seedlings."Condition (Season Lag): "Season Progress (GDD) is 50% behind average. Sowing now is fine, but don't expect to plant out until {adjusted_date} based on current warming trends."
3. "Plant Out" Tooltip (The Hardening Off Logic)When the user moves a plant from sow_indoors to the garden, this is the highest risk of plant death.Logic: Compare temperature_2m_min and uv_index.The Tooltip Content:Condition (UV Shock): "Danger: High UV (6) today. Do not move indoor seedlings directly into the sun. Start 'hardening off' in a shaded spot for 2 hours only."Condition (Wind Stress): "High wind gusts (38 km/h). Newly transplanted {seed.name} will struggle with windburn. Wait for Tuesday’s calm window."Suggested Database & Logic MappingSince your optimum_soil_temp is currently TEXT, you’ll likely want to parse it to an integer for comparison.DB FieldAPI MatchLogic / Tooltip Triggeroptimum_soil_tempsoil_temperature_6cmIf soil_temp < optimum_temp, show "Soil Too Cold" warning.days_to_germinatedaily_min_temp (7-day)If min_temp < 0°C inside the germination window, show "Late Frost Risk".light_requirementscloud_cover / radiationIf "Full Sun" required but 100% cloud cover forecast, show "Grow Light Recommended".typevapor_pressure_deficitIf type is "Vegetable" (like Tomatoes) and VPD is low, show "Blight Alert".

## Second



## Third 

I have an app that start  with a SQL command to add some example seeds into the database. I want you to analyse the schema, then for each seed that I purchased look into the website and extract the information for each seed. Then in the end generate a SQL command with all the information you gathered.

INSERT INTO seeds (
  name, variety, type, quantity, supplier, purchase_year, 
  sow_by_year, notes, purchase_link, days_to_germinate, 
  optimum_soil_temp, optimum_soil_type, plant_height, 
  light_requirements, growing_instructions,
  sow_indoors_start, sow_indoors_end, sow_outdoors_start, 
  sow_outdoors_end, plant_out_start, plant_out_end, 
  harvest_start, harvest_end
)
VALUES
  ('Tomato', 'Gardeners Delight', 'vegetable', 30, 'Thompson & Morgan', 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '01-02', '31-03', NULL, NULL, '15-05', '15-06', '01-07', '31-10'),
  ('Courgette', 'Black Beauty', 'vegetable', 15, 'RHS', 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '01-04', '15-05', '15-05', '01-06', '01-06', '15-06', '01-07', '30-09'),
  ('Lettuce', 'Little Gem', 'vegetable', 50, 'Suttons', 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '01-02', '31-08', '15-03', '01-09', NULL, NULL, '01-05', '30-11'),
  ('Basil', 'Sweet Genovese', 'herb', 20, 'Jekka''s', 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '01-03', '31-05', NULL, NULL, '01-06', '15-06', '01-06', '30-09'),
  ('Kale', 'Cavolo Nero', 'vegetable', 25, 'Thompson & Morgan', 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '01-04', '31-07', '15-04', '31-07', NULL, NULL, '01-10', '31-03'),
  ('Beetroot', 'Boltardy', 'vegetable', 40, 'Suttons', 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '15-03', '31-07', NULL, NULL, '01-06', '31-10'),
  ('Peas', 'Kelvedon Wonder', 'vegetable', 60, 'Thompson & Morgan', 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '15-02', '30-06', NULL, NULL, '01-06', '30-09'),
  ('Chilli', 'Apache', 'vegetable', 10, 'Nicky''s', 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '15-01', '31-03', NULL, NULL, '15-05', '01-06', '01-08', '31-10');




9 Apr 2025: https://yorkshire-seeds.co.uk/?country=GB

Lychnis Arkwright S Campion - 250x Seeds - lychnis - Flower £1.49 https://yorkshire-seeds.co.uk/products/lychnis-arkwright-s-campion-250x-seeds-lychnis-flower?_pos=1&_psq=Lychnis+Arkwright+S+Campion+-+250x+Seeds+-+lychnis+-+Flower&_ss=e&_v=1.0
Red California Poppy Chief Eschscholzia Californica - 2100x - Flower £1.29 https://yorkshire-seeds.co.uk/products/red-california-poppy-chief-eschscholzia-californica-2100x-flower?_pos=1&_psq=Red+California+Poppy+Chief+Eschscholzia+Californica+-+2100x+-+Flower&_ss=e&_v=1.0
Giant Pak Choi Chinese Cabbage White Stem Canton - 100x Seeds - Vegetable £1.59 https://yorkshire-seeds.co.uk/products/giant-pak-choi-chinese-cabbage-white-stem-canton-100x-seeds-vegetable?_pos=1&_psq=Giant+Pak+Choi+Chinese+Cabbage+White+Stem+Canton+-+100x+Seeds+-+Vegetable&_ss=e&_v=1.0
Leek Giant Winter Seeds - 350x Seeds - Vegetable Seeds - Premium Seeds £1.19 https://yorkshire-seeds.co.uk/products/leek-giant-winter-seeds-350x-seeds-vegetable-seeds-premium-seeds?_pos=1&_psq=Leek+Giant+Winter+Seeds+-+350x+Seeds+-+Vegetable+Seeds+-+Premium+Seeds&_ss=e&_v=1.0
shallot zebrune - 500x seeds - Vegetable £1.39  https://yorkshire-seeds.co.uk/products/shallot-zebrune-500x-seeds-vegetable?_pos=1&_psq=shallot+zebrune+-+500x+seeds+-+Vegetable&_ss=e&_v=1.0
4100x Carrot Touchon Seeds - Vegetable £1.19  https://yorkshire-seeds.co.uk/products/4100x-carrot-touchon-seeds-vegetable-b104?_pos=1&_psq=4100x+Carrot+Touchon+Seeds+-+Vegetable&_ss=e&_v=1.0
900x Pink Soapwort Saponaria Ocymoides Seeds - Rock - Flower Perennial £1.19 https://yorkshire-seeds.co.uk/products/900x-pink-soapwort-saponaria-ocymoides-seeds-rock-flower-perennial-d1612?_pos=1&_psq=900x+Pink+Soapwort+Saponaria+Ocymoides+Seeds+-+Rock+-+Flower+Perennial&_ss=e&_v=1.0
1200x Forget Me Not Rose Pink Myosotis Alpestris Seeds - Flower £1.19 https://yorkshire-seeds.co.uk/products/1200x-forget-me-not-rose-pink-myosotis-alpestris-seeds-flower-b1015?_pos=1&_psq=1200x+Forget+Me+Not+Rose+Pink+Myosotis+Alpestris+Seeds+-+Flower&_ss=e&_v=1.0
350x Verbena Tenuisecta Annual Flower Seeds - Violet Moss £1.19 https://yorkshire-seeds.co.uk/products/350x-verbena-tenuisecta-annual-flower-seeds-violet-moss-b512?_pos=1&_psq=350x+Verbena+Tenuisecta+Annual+Flower+Seeds+-+Violet+Moss&_ss=e&_v=1.0
4000x Parsley Giant Italian Seeds - Petroselinum - Grow All Year Round - Herb £1.19 https://yorkshire-seeds.co.uk/products/4000x-parsley-giant-italian-seeds-petroselinum-grow-all-year-round-herb-b117?_pos=1&_psq=4000x+Parsley+Giant+Italian+Seeds+-+Petroselinum+-+Grow+All+Year+Round+-+Herb&_ss=e&_v=1.0
Chives Seeds - Herb - 200 Seeds - Finest £1.19 https://yorkshire-seeds.co.uk/products/chives-seeds-herb-200-seeds-finest?_pos=1&_psq=Chives+Seeds+-+Herb+-+200+Seeds+-+Finest&_ss=e&_v=1.0
Lemongrass Cymbopogon Flexuous Herb - 350x Seeds - Aromatic £1.19 https://yorkshire-seeds.co.uk/products/lemongrass-cymbopogon-flexuous-herb-350x-seeds-aromatic-b520?_pos=1&_psq=Lemongrass+Cymbopogon+Flexuous+Herb+-+350x+Seeds+-+Aromatic&_ss=e&_v=1.0
Peppermint Mentha Piperita - 500x seeds - Herb £1.49 https://yorkshire-seeds.co.uk/products/peppermint-mentha-piperita-500x-seeds-herb?_pos=1&_psq=Peppermint+Mentha+Piperita+-+500x+seeds+-+Herb&_ss=e&_v=1.0
Oregano Seeds - Herb - 700x Seeds - Finest £1.19 https://yorkshire-seeds.co.uk/products/oregano-seeds-herb-700x-seeds-finest?_pos=1&_psq=Oregano+Seeds+-+Herb+-+700x+Seeds+-+Finest&_ss=e&_v=1.0
Thyme Seeds - Herb - 350 Seeds - Finest £1.19 https://yorkshire-seeds.co.uk/products/thyme-seeds-herb-350-seeds-finest?_pos=1&_psq=Thyme+Seeds+-+Herb+-+350+Seeds+-+Finest&_ss=e&_v=1.0


Mint Seeds - 800x Seeds - Finest Herb Seeds - Vegetable Seeds × 1 https://yorkshire-seeds.co.uk/products/mint-seeds-800x-seeds-finest-herb-seeds-vegetable-seeds?_pos=1&_sid=bf8de86c7&_ss=r
700 Coriander/Cilantro Seeds - Free Delivery - Finest Herb Seeds × 1 https://yorkshire-seeds.co.uk/products/700-coriandercilantro-seeds-free-delivery-finest-herb-seeds?_pos=1&_psq=700+Coriander%2FCilantro+Seeds+-+Free+Delivery+-+Finest+Herb+Seeds&_ss=e&_v=1.0
Gherkin F1 Adam Pickling Gherkin Cucumber - 20x Seeds - Vegetable × 1 https://yorkshire-seeds.co.uk/products/gherkin-f1-adam-pickling-gherkin-cucumber-20x-seeds-vegetable?_pos=1&_psq=Gherkin+F1+Adam+Pickling+Gherkin+Cucumber+-+20x+Seeds+-+Vegetable&_ss=e&_v=1.0
Asparagus Mary Washington - 50x seeds - Vegetable × 1 https://yorkshire-seeds.co.uk/products/asparagus-mary-washington-50x-seeds-vegetable?_pos=1&_psq=Asparagus+Mary+Washington+-+50x+seeds+-+Vegetable&_ss=e&_v=1.0
Gherkin Seeds 35x National Cucumber Pickling - Vegetable Seeds × 1 https://yorkshire-seeds.co.uk/products/gherkin-seeds-35x-national-cucumber-pickling-vegetable-seeds?_pos=1&_psq=Gherkin+Seeds+35x+National+Cucumber+Pickling+-+Vegetable+Seeds&_ss=e&_v=1.0
Vegetable - Beetroot - Boltardy - 200 Seeds - Finest Seeds × 1 https://yorkshire-seeds.co.uk/products/vegetable-beetroot-boltardy-200-seeds-finest-seeds?_pos=1&_psq=Vegetable+-+Beetroot+-+Boltardy+-+200+Seeds+-+Finest+Seeds&_ss=e&_v=1.0
1100x Lettuce Iceberg Great Lakes 118 Seeds - Sweet Variety - Vegetable × 1 https://yorkshire-seeds.co.uk/products/1100x-lettuce-iceberg-great-lakes-118-seeds-sweet-variety-b514?_pos=1&_psq=1100x+Lettuce+Iceberg+Great+Lakes+118+Seeds+-+Sweet+Variety+-+Vegetable&_ss=e&_v=1.0


17 April 2025:
1200x Nemesia Orange Prince Seeds - Nemesia Strumosa Annual Flower - Clusters £1.19 https://yorkshire-seeds.co.uk/products/1200x-nemesia-orange-prince-seeds-nemesia-strumosa-annual-flower-clusters-d169?_pos=1&_sid=a5552898f&_ss=r
300x French Marigold Dwarf Tagetes Boy Spry - Flower £1.19 https://yorkshire-seeds.co.uk/products/300x-french-marigold-dwarf-tagetes-boy-spry-flower-b106?_pos=1&_psq=300x+French+Marigold+Dwarf+Tagetes+Boy+Spry&_ss=e&_v=1.0
350x Marigold Starfire Mix Seeds - Tagetes Tenuifolia - Mexican Marigold Flower £1.19 https://yorkshire-seeds.co.uk/products/350x-marigold-starfire-mix-seeds-tagetes-tenuifolia-mexican-marigold-flower-a55?_pos=1&_psq=350x+Marigold+Starfire+Mix+Seeds+-+Tagetes+Tenuifolia+-+Mexican+Marigold+Flower&_ss=e&_v=1.0
African Marigold Tall Sierra - 350x seeds - Huge Orange Flowers £1.39 https://yorkshire-seeds.co.uk/products/african-marigold-tall-sierra-350x-seeds-huge-orange-flowers?_pos=1&_psq=African+Marigold+Tall+Sierra+-+350x+seeds+-+Huge+Orange+Flowers&_ss=e&_v=1.0
Parsnip White Gem Fresh Vegetable 350x Seeds £0.99 https://yorkshire-seeds.co.uk/products/parsnip-white-gem-fresh-vegetable-350x-seeds?_pos=1&_psq=Parsnip+White+Gem+Fresh+Vegetable+350x+Seeds&_ss=e&_v=1.0
Jumbo Sweet Spanish Onion - 300x Seeds - Vegetable £1.19 https://yorkshire-seeds.co.uk/products/jumbo-sweet-spanish-onion-300x-seeds-vegetable?_pos=1&_psq=Jumbo+Sweet+Spanish+Onion+-+300x+Seeds+-+Vegetable&_ss=e&_v=1.0
Bulgarian Giant Leek Winter Hardy - 100x Seeds - Vegetable £1.29 https://yorkshire-seeds.co.uk/products/bulgarian-giant-leek-winter-hardy-100x-seeds-vegetable?_pos=1&_psq=Bulgarian+Giant+Leek+Winter+Hardy+-+100x+Seeds+-+Vegetable&_ss=e&_v=1.0
Champagne Rhubarb Spring & Autumn Seeds - 30x Seeds - Vegetable £1.29 https://yorkshire-seeds.co.uk/products/champagne-rhubarb-spring-autumn-seeds-30x-seeds-vegetable?_pos=1&_psq=Champagne+Rhubarb+Spring+%26+Autumn+Seeds+-+30x+Seeds+-+Vegetable&_ss=e&_v=1.0
Vegetable - Lettuce - Little Gem - 1500 Seeds - Premium Vegetable Seeds £1.19 https://yorkshire-seeds.co.uk/products/vegetable-lettuce-little-gem-1500-seeds-premium-vegetable-seeds?_pos=1&_psq=Vegetable+-+Lettuce+-+Little+Gem+-+1500+Seeds+-+Premium+Vegetable+Seeds&_ss=e&_v=1.0
Spring Onion Seeds - 700 seeds - Long White Ishikura - Vegetable Seeds £1.19 https://yorkshire-seeds.co.uk/products/spring-onion-seeds-700-seeds-long-white-ishikura-vegetable-seeds?_pos=1&_psq=Spring+Onion+Seeds+-+700+seeds+-+Long+White+Ishikura+-+Vegetable+Seeds&_ss=e&_v=1.0

17 April 2025:
Green Large Broccoli Calabrese - 100x Seeds - Vegetable £1.19 https://yorkshire-seeds.co.uk/products/green-large-broccoli-calabrese-100x-seeds-vegetable-b310?_pos=1&_psq=Green+Large+Broccoli+Calabrese+-+100x+Seeds+-+Vegetable&_ss=e&_v=1.0
Giant Sweet Red Ball Cabbage - 100x Seeds - Simple to Grow - Vegetable £1.19 https://yorkshire-seeds.co.uk/products/giant-sweet-red-ball-cabbage-100x-seeds-simple-to-grow-vegetable-b37?_pos=1&_psq=Giant+Sweet+Red+Ball+Cabbage+-+100x+Seeds+-+Simple+to+Grow+-+Vegetable&_ss=e&_v=1.0
Giant Black Magic British Kale - 100x Seeds - Borecole - Vegetable £1.19 https://yorkshire-seeds.co.uk/products/giant-black-magic-british-kale-100x-seeds-borecole-vegetable-b38?_pos=1&_psq=Giant+Black+Magic+British+Kale+-+100x+Seeds+-+Borecole+-+Vegetable&_ss=e&_v=1.0
Radish Rainbow Mix - 1300x Seeds - Fast Growing - Red Purple Yellow - Vegetable £1.19 https://yorkshire-seeds.co.uk/products/radish-rainbow-mix-1300x-seeds-fast-growing-red-purple-yellow-vegetable-b115?_pos=1&_psq=Radish+Rainbow+Mix+-+1300x+Seeds+-+Fast+Growing+-+Red+Purple+Yellow+-+Vegetable&_ss=e&_v=1.0
Aubergine Moneymaker F1 - 50x Seeds - Solanum Melongena - Vegetable £1.19 https://yorkshire-seeds.co.uk/products/aubergine-moneymaker-f1-50x-seeds-solanum-melongena-vegetable-b103?_pos=1&_psq=Aubergine+Moneymaker+F1+-+50x+Seeds+-+Solanum+Melongena+-+Vegetable&_ss=e&_v=1.0
Basil Licorice - 900x Seeds - Herb - Finest £1.59 https://yorkshire-seeds.co.uk/products/400x-herb-basil-thai-liquorice-flavour-finest-seeds-herb
Italian Parsley Triple Moss Curled - 700x Seeds - Herb £1.29 https://yorkshire-seeds.co.uk/products/italian-parsley-triple-moss-curled-700x-seeds-herb?_pos=1&_sid=2cb056b09&_ss=r
Herb - Dill - Anethum Graveolens - 1000 Seeds - Finest Seeds £1.19 https://yorkshire-seeds.co.uk/products/herb-dill-anethum-graveolens-1000-seeds-finest-seeds?_pos=1&_psq=Herb+-+Dill+-+Anethum+Graveolens+-+1000+Seeds+-+Finest+Seeds&_ss=e&_v=1.0
50x Sage Broad Leaved Salvia Officinalis Seeds - Herb £1.39 https://yorkshire-seeds.co.uk/products/50x-sage-broad-leaved-salvia-officinalis-seeds-herb?_pos=1&_psq=50x+Sage+Broad+Leaved+Salvia+Officinalis+Seeds+-+Herb&_ss=e&_v=1.0
Rocket Salad Cultivated - 12,000x Seeds - Herb £1.39 https://yorkshire-seeds.co.uk/products/wild-rocket-salad-seeds-italian-arugula-sylvetta-3000-seeds?_pos=1&_psq=rocket&_ss=e&_v=1.0
Herb Thyme - Purple Creeping - 900 Seeds - Premium Finest Seeds https://yorkshire-seeds.co.uk/products/herb-thyme-purple-creeping-900-seeds-premium-finest-seeds?_pos=1&_sid=751bafaad&_ss=r


18 July 2025: https://yorkshire-seeds.co.uk/?country=GB
Giant Winter Spinach Seeds 300x - Hardy - Spinach - Vegetable £1.29 https://yorkshire-seeds.co.uk/products/giant-winter-spinach-seeds-300x-hardy-spinach-vegetable?_pos=1&_psq=Giant+Winter+Spinach+Seeds+300x+-+Hardy+-+Spinach+-+Vegetable&_ss=e&_v=1.0
Giant Winter Spinach Baby Leaf Year Round - 100x Seeds - Vegetable £1.59 https://yorkshire-seeds.co.uk/products/giant-winter-spinach-baby-leaf-year-round-100x-seeds-vegetable?_pos=1&_psq=Giant+Winter+Spinach+Baby+Leaf+Year+Round+-+100x+Seeds+-+Vegetable&_ss=e&_v=1.0
Atena Polka Courgette F1 - 10x Seeds - Vegetable £1.29 https://yorkshire-seeds.co.uk/products/atena-polka-courgette-f1-10x-seeds-vegetable?_pos=1&_psq=Atena+Polka+Courgette+F1+-+10x+Seeds+-+Vegetable&_ss=e&_v=1.0
Lettuce Lollo Rosso Leaf - 1100x Seeds - Vegetable £1.19 https://yorkshire-seeds.co.uk/products/lettuce-lollo-rosso-leaf-1100x-seeds-vegetable-b118?_pos=1&_psq=Lettuce+Lollo+Rosso+Leaf+-+1100x+Seeds+-+Vegetable&_ss=e&_v=1.0
Lettuce Seed Babyleaf Mixed Leaves 950 Seeds - Easy Cut And Grow Again Salad £1.49 https://yorkshire-seeds.co.uk/products/lettuce-seed-babyleaf-mixed-leaves-950-seeds-easy-cut-and-grow-again-salad?_pos=1&_psq=Lettuce+Seed+Babyleaf+Mixed+Leaves+950+Seeds+-+Easy+Cut+And+Grow+Again+Salad&_ss=e&_v=1.0
Lettuce All Year Round Seeds x 600 Butterhead Heritage - Vegetable Seeds £1.19 https://yorkshire-seeds.co.uk/products/lettuce-all-year-round-seeds-x-600-butterhead-heritage-vegetable-seeds?_pos=1&_psq=Lettuce+All+Year+Round+Seeds+x+600+Butterhead+Heritage+-+Vegetable+Seeds&_ss=e&_v=1.0
Lettuce Salad Bowl Green - 1500x seeds - Lettuce £1.29 https://yorkshire-seeds.co.uk/products/organic-lettuce-salad-bowl-green-1500x-seeds-lettuce?_pos=1&_psq=Lettuce+Salad+Bowl+Green+-+1500x+seeds+-+Lettuce&_ss=e&_v=1.0


4 April 2026: https://premierseedsdirect.com
Lettuce Gourmet Looseleaf Cutting Mix × 1	£1.39	https://premierseedsdirect.com/product/lettuce-gourmet-looseleaf-cutting-mix/
Lettuce Crispy Mix × 1	£1.39	https://premierseedsdirect.com/product/lettuce-crispy-mix/
Mustard Salad Leaf 'Tasty Mix' Seed Count: 1000 Seeds × 1	£1.39	https://premierseedsdirect.com/product/mustard-salad-leaf-tasty-mix/
Carrot Resistafly Seed Count: 1300 × 1	https://premierseedsdirect.com/product/carrot-resistafly/
Carrot Sweet Candle F1 - 220 × 1	https://premierseedsdirect.com/product/carrot-sweet-candle-f1/?attribute_pa_seed-count=220
Carrot Rainbow Mix - 1500 × 1	https://premierseedsdirect.com/product/carrot-rainbow-mix/?attribute_pa_seed-count=1500
Pepper 'Habanero Chocolate' - 15 Seeds × 1	https://premierseedsdirect.com/product/pepper-habanero-chocolate/?attribute_pa_seed-count=15-seeds
Pepper 'Habanero Orange' - 15 Seeds × 1	https://premierseedsdirect.com/product/pepper-habanero-orange/?attribute_pa_seed-count=15-seeds
Tomato Sweet Million F1 - 20 × 1	£1.59	https://premierseedsdirect.com/product/tomato-cherry-sweet-million-f1/?attribute_pa_seed-count=20
Tomato Sweet Aperitif - 20 × 1	£1.59	https://premierseedsdirect.com/product/tomato-cherry-sweet-aperitif/?attribute_pa_seed-count=20
Tomato Nagina F1 (Blight Resistant) - 10 × 1	£1.49	https://premierseedsdirect.com/product/tomato-plum-nagina-f1/?attribute_pa_seed-count=10
Tomato Riesling F1 - 10 Seeds × 1	£1.89	https://premierseedsdirect.com/product/tomato-rielsing-f1/?attribute_pa_seed-count=10-seeds
Tomato Supersweet 100 F1 - 10 Seeds × 1	£1.89	https://premierseedsdirect.com/product/tomato-supersweet-100-f1/
Tomato 'Romello' F1 - 6 Seeds × 1	£1.59	https://premierseedsdirect.com/product/tomato-romello-f1/?attribute_pa_seed-count=6-seeds
Cucumber Gherkin - Anulka F1 Size: 4gm × 1	£1.89	https://premierseedsdirect.com/product/cucumber-gherkin-anulka-f1-4-gram/
Hot Chilli Pepper Jalapeno M - 25 × 1	£1.39	https://premierseedsdirect.com/product/hot-chilli-pepper-jalapeno-m/?attribute_pa_seed-count=25
Hot Pepper 'Large Red Cherry' - 75 Seeds × 1	£1.29	https://premierseedsdirect.com/product/hot-chilli-pepper-large-red-cherry/?attribute_pa_seed-count=75-seeds



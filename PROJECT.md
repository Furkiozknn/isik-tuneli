# isik-tuneli (Işık Tüneli)

**Hedef**: Tarayıcıda oynanan, uzayda bir tünelde ilerleyen küçük bir endless-arcade oyunu — sağa/sola (ve yukarı/aşağı) hareket ederek engellerden kaçıp ışık küreleri toplamak, hız zamanla artar, çarpışınca oyun biter ve skor gösterilir.

**Kapsam dışı**: mobil dokunmatik kontrol optimizasyonu, ses/müzik, seviye/bölüm sistemi, kalıcı skor tablosu (localStorage hariç), çoklu gemi/karakter seçimi — bunlar sonraki bir sürüm.

**Araç/stack**: Three.js (import map + CDN, build adımı yok) + gerçek bloom post-processing — kalp-animasyon'da kurduğumuz altyapıyla aynı yaklaşım, hız kazanmak için.

**Bitti tanımı**: Tarayıcıda açılınca oyun otomatik başlıyor, klavye (ok tuşları/WASD) ile gemi hareket ediyor, engellere çarpınca "Game Over" ekranı + skor çıkıyor, boşluk/tıkla yeniden başlatılabiliyor, konsolda hata yok, masaüstü ve mobilde (dokunmatikle) makul çalışıyor.

**Sonraki sürüm eklentisi**: "Daily Challenge" modu eklendi — günün UTC tarihinden seedlenen deterministik bir RNG (mulberry32) ile spawn mantığı, böylece aynı gün oynayan herkes birebir aynı deseni görüyor ve skorlar gerçekten karşılaştırılabilir hale geliyor. Endless mod (gerçek `Math.random()`) hiç değişmedi — bu tamamen ek bir özellik.

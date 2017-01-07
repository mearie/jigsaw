IMAGES=kinkakuji pteridium hochiminh tajinepots jamehisfahan

.PHONY: all
all: $(IMAGES:%=%.jpg) $(IMAGES:%=%-thumb.jpg)

kinkakuji.jpg:
	wget https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Kinkaku-ji_in_November_2016_-02.jpg/768px-Kinkaku-ji_in_November_2016_-02.jpg -O $@

pteridium.jpg:
	wget https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/%D0%9F%D1%80%D0%BE%D0%B2%D0%BE%D0%B4%D1%8F%D1%89%D0%B8%D0%B9_%D0%BF%D1%83%D1%87%D0%BE%D0%BA_Pteridium_aquilinum.JPG/1280px-%D0%9F%D1%80%D0%BE%D0%B2%D0%BE%D0%B4%D1%8F%D1%89%D0%B8%D0%B9_%D0%BF%D1%83%D1%87%D0%BE%D0%BA_Pteridium_aquilinum.JPG -O $@

hochiminh.jpg:
	wget https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Vista_de_Ciudad_Ho_Chi_Minh_desde_Bitexco_Financial_Tower%2C_Vietnam%2C_2013-08-14%2C_DD_13.JPG/1280px-Vista_de_Ciudad_Ho_Chi_Minh_desde_Bitexco_Financial_Tower%2C_Vietnam%2C_2013-08-14%2C_DD_13.JPG -O $@

tajinepots.jpg:
	wget https://upload.wikimedia.org/wikipedia/commons/4/4d/Tajines_in_a_pottery_shop_in_Morocco.jpg -O $@

.INTERMEDIATE: jamehisfahan-orig.jpg
jamehisfahan-orig.jpg:
	wget https://upload.wikimedia.org/wikipedia/commons/5/57/Gran_Mezquita_de_Isfah%C3%A1n%2C_Isfah%C3%A1n%2C_Ir%C3%A1n%2C_2016-09-20%2C_DD_26.jpg -O $@

jamehisfahan.jpg: jamehisfahan-orig.jpg
	convert '$<[8216x5135+0+403]' -resize 4000x $@

%-thumb.jpg: %.jpg
	convert $< -resize '180x100^' -gravity center -crop '180x100+0+0' $@


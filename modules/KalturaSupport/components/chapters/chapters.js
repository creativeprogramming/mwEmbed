(function ( mw, $ ) {
	"use strict";

	mw.PluginManager.add( 'chapters', mw.KBaseMediaList.extend( {

		defaultConfig: {
			'parent': 'sideBarContainer',
			'containerPosition': null,
			'order': 2,
			'showTooltip': false,
			"displayImportance": 'high',
			'templatePath': 'components/chapters/chapters.tmpl.html',
			'cuePointType': ['thumbCuePoint.Thumb'],
			'oneSecRotatorSlidesLimit': 61,
			'twoSecRotatorSlidesLimit': 250,
			'maxRotatorSlides': 125,
			'mediaItemWidth': 290,
			'titleLimit': 29,
			'descriptionLimit': 80,
			'thumbnailWidth' : 100,
			'horizontalMediaItemWidth': 290,
			'overflow': false,
			'includeThumbnail': true,
			'includeItemStartTime': true,
			'includeItemNumberPattern': false,
			'includeMediaItemDuration': true,
			'onPage': false,
			'cssFileName': 'chapters.css'
		},

		mediaList: [],

		isDisabled: true,

		setup: function ( embedPlayer ) {
			this.addBindings();
		},
		addBindings: function () {
			var _this = this;

			this.bind( 'KalturaSupport_ThumbCuePointsReady', function () {
				//Get chapters data from cuepoints
				var chaptersRawData =_this.getChaptersData();
				//Create media items from raw data
				_this.addMediaItems(chaptersRawData);
				//Need to recalc all durations after we have all the items startTime values
				_this.setMediaItemTime();
				//Set data initialized flag for handlers to start working
				_this.dataIntialized = true;
				//Render the media list
				if (_this.getPlayer().layoutBuilder.layoutReady) {
					_this.renderMediaList();
				}
			} );

			this.bind( 'playerReady updatePlayHeadPercent', function ( e, newState ) {
				if (_this.dataIntialized) {
					_this.updateActiveItem();
				}
			});

			this.bind( 'onChangeMedia', function(){
				_this.destroy();
				// redraw the list
				_this.shouldAddScroll();
			});
		},
		isSafeEnviornment: function(){
			var _this = this;
			var res = false;
			if (this.getPlayer().kCuePoints){
				var cuePoints = this.getPlayer().kCuePoints.getCuePoints();
				var filteredCuePoints = $.grep(cuePoints, function(cuePoint){
					var found = false;
					$.each(_this.getConfig('cuePointType'), function(i, cuePointType){
						if (cuePointType == cuePoint.cuePointType) {
							found = true;
							return false;
						}
					});
					return found;
				});
				res =  (filteredCuePoints.length > 0) ? true : false;
			}
			return res;
		},
		getMedialistContainer: function(){
			//Only support external onPage medialist container
			if ( this.getConfig( 'onPage' ) ) {
				return this._super();
			}
		},
		getChaptersData: function(){
			var _this = this;
			//Init data provider
			var cuePoints = this.getPlayer().kCuePoints.getCuePoints();
			//Generate data transfer object
			var filteredCuePoints = $.grep(cuePoints, function(cuePoint){
				var found = false;
				$.each(_this.getConfig('cuePointType'), function(i, cuePointType){
					if (cuePointType == cuePoint.cuePointType) {
						found = true;
						return false;
					}
				});
				return found;
			});

			filteredCuePoints.sort( function ( a, b ) {
				return a.startTime - b.startTime;
			} );
			return filteredCuePoints;
		},
		addMediaItems: function(items){
			var _this = this;
			$.each(items, function(index, item){
				var mediaItem;
				var customData = item.partnerData ? JSON.parse(item.partnerData) :  {};
				var title = item.title || customData.title;
				var description = item.description || customData.desc;
				var thumbnailUrl = item.thumbnailUrl || customData.thumbUrl || _this.getThumbUrl(item);
				var thumbnailRotatorUrl = _this.getConfig( 'thumbnailRotator' ) ? _this.getThumRotatorUrl() : '';

				mediaItem = {
					order: index,
					id: item.id,
					title: title,
					description: description,
					width: _this.getConfig( 'mediaItemWidth' ),
					thumbnail: {
						url: thumbnailUrl,
						thumbAssetId: item.assetId,
						rotatorUrl: thumbnailRotatorUrl,
						width: _this.getThumbWidth(),
						height: _this.getThumbHeight()
					},
					startTime: item.startTime / 1000,
					startTimeDisplay: _this.formatTimeDisplayValue(kWidget.seconds2npt( item.startTime / 1000 )),
					endTime: null,
					durationDisplay: null,
					chapterNumber: _this.getItemNumber(index)

				};
				_this.mediaList.push(mediaItem);
			});
		},
		getMediaItemThumbs: function(callback){
			var _this = this;
			var requestArray = [];
			var response = [];
			$.each(this.mediaList, function(index, item) {
				requestArray.push(
					{
						'service': 'thumbAsset',
						'action': 'getUrl',
						'id': item.thumbnail.thumbAssetId
					}
				);
				response[index] = { id: item.id, url: null};
			});

			// do the api request
			this.getKalturaClient().doRequest( requestArray, function ( data ) {
				// Validate result
				if ( !_this.isValidResult( data ) ) {
					return;
				}
				$.each(data, function(index, url) {
					response[index]['url'] = url;

				});
				callback.apply(_this, [response]);
			} );
		},
		setMediaItemTime: function(){
			var _this = this;
			$.each(this.mediaList, function(index, item){
				if (_this.mediaList[index + 1]){
					item.endTime = _this.mediaList[index + 1].startTime;
				} else {
					item.endTime = _this.getPlayer().duration;
				}

				item.durationDisplay = kWidget.seconds2npt((item.endTime - item.startTime) );
			});
		},
		formatTimeDisplayValue: function(time){
			// Add 0 padding to start time min
			var timeParts = time.split(':');
			if( timeParts.length == 2 && timeParts[0].length == 1 ) {
				time = '0' + time;
			}
			return time;
		},

		isValidResult: function( data ){
			// Check if we got error
			if( !data
				||
				( data.code && data.message )
				){
				//this.log('Error getting related items: ' + data.message);
				//this.getBtn().hide();
				this.error = true;
				return false;
			}
			this.error = false;
			return true;
		},
		//UI Handlers
		mediaClicked: function(mediaIndex){
			// start playback
			this.getPlayer().sendNotification( 'doPlay' );
			// see to start time and play ( +.1 to avoid highlight of prev chapter )
			this.getPlayer().sendNotification( 'doSeek', ( this.mediaList[mediaIndex].startTime ) + .1 );
		},
		updateActiveItem: function( ){
			var _this = this;
			// search chapter for current active
			var activeIndex = 0;
			var time = this.getPlayer().currentTime;
			$.each( this.mediaList, function( inx, item){
				if( time > ( item.startTime ) ){
					activeIndex = inx;
				}
			});
			var $activeChapter = this.getActiveItem();
			var actualActiveIndex = this.selectedMediaItemIndex;
			// Check if active is not already set:
			if( actualActiveIndex == activeIndex ) {
				// update duration count down:
				var item = this.mediaList[ activeIndex ];
				if ( item ) {
					if (!item.active){
						this.setSelectedMedia( activeIndex );
						item.active = true;
					}
					var endTime = item.endTime;
					var countDown = Math.abs( time - endTime );
					this.updateActiveItemDuration( countDown );
				}
			} else {
				var item = _this.mediaList[ actualActiveIndex ];
				if ( item && item.active) {
					item.active = false;
					var startTime = item.startTime ;
					var endTime = item.endTime;
					this.updateActiveItemDuration( endTime - startTime );
				}

				// Check if we should pause on chapter update:
				if ( this.getConfig( 'pauseAfterChapter' ) && !this.skipPauseFlag ) {
					this.getPlayer().sendNotification( 'doPause' );
				}
				// restore skip pause flag:
				this.skipPauseFlag = false;

				if ( this.mediaList[ activeIndex ] ) {
					this.setSelectedMedia(activeIndex);
				}
			}
		}
	}));
})( window.mw, window.jQuery );